import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createApp} from '../../server.mjs';
import {colorIcon,spritePalette,templateIcon,statusBadgeSvg} from '../../public/icons.js';

// Input is the JSON produced by SnrCheck, not fabricated colour values.
const palette=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.deepEqual(Object.keys(palette).map(Number),Array.from({length:64},(_,i)=>i+18));
class Client extends EventEmitter {
 members=[{id:'snr-user',name:'SNRテスト',speaking:true}];
 channel={id:'voice',name:'test'};status='connected';close(){}
}
const dir=await mkdtemp(path.join(os.tmpdir(),'crew-snr-'));
const app=await createApp({directory:dir,allowPlaintextSettings:true,discordClient:new Client()});
let cases=0;
try {
 await app.store.save({links:[{gameKey:'name:SNR',discordId:'snr-user'}],settings:{colorBackground:true,bounceSpeaking:true}});
 for(const [id,shade] of Object.entries(palette))for(const lifeState of ['alive','dead','exiled']){
  app.ingestGame({scene:'Tasks',lifeTracking:true,modVersion:'SNR 追加カラー',players:[{key:'name:SNR',name:'SNR',colorId:Number(id),color:shade.Body,shadowColor:shade.Shadow,visorColor:shade.Visor,colorSource:'snr',colorKnown:true,lifeState}]});
  const state=app.snapshot(),p=state.rows[0].player;
  assert.equal(state.mode,'live');assert.equal(p.colorKnown,true);assert.equal(p.colorSource,'snr');
  assert.equal(state.rows[0].member.speaking,true);
  assert.equal(spritePalette(p).body,shade.Body);assert.equal(spritePalette(p).shadow,shade.Shadow);assert.equal(spritePalette(p).visor,shade.Visor);
  assert.equal(colorIcon(p),null);
  assert.equal(templateIcon(p),`/icons/aucyan${lifeState==='alive'?'':'dead'}.png`);
  assert.equal(statusBadgeSvg(lifeState)!==null,lifeState!=='alive');
  cases++;
 }
 for(let colorId=0;colorId<18;colorId++)for(const lifeState of ['alive','dead','exiled']){
  app.ingestGame({scene:'Tasks',modVersion:'SNR 追加カラー',players:[{key:'name:SNR',name:'SNR',colorId,color:'#c51111',colorSource:'snr',colorKnown:true,lifeState}]});
  const p=app.snapshot().rows[0].player;
  assert.equal(p.colorKnown,true);assert.match(colorIcon(p),lifeState==='alive'?/\/au[a-z]+\.png$/:/dead\.png$/);
  cases++;
 }
 app.ingestGame({scene:'Tasks',players:[{key:'name:SNR',colorId:82,color:'#8794a3',colorSource:'snr',colorKnown:false}]});
 assert.equal(app.snapshot().rows[0].player.colorKnown,false);assert.equal(colorIcon(app.snapshot().rows[0].player),null);
 console.log(`SNR display integration passed: ${cases} colour/life combinations (64 official extra + 18 standard colours, alive/dead/exiled), speaking state and unavailable colour.`);
} finally {app.shutdown();await rm(dir,{recursive:true,force:true});}
