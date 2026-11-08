import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GamePresentation} from '../lib/game-presentation.mjs';
import {createApp} from '../server.mjs';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
const p=(key,lifeState='alive',color='#c51111')=>({key,name:key,lifeState,color});
test('終了→ロビーの欠け・空フレームを保持し、戻った本人だけ更新する',()=>{
 let time=0;const display=new GamePresentation({now:()=>time});display.update({scene:'Tasks',players:[p('a'),p('b','dead')]});time=100;display.update({scene:'Ended',players:[p('a'),p('b','dead')]});time=500;display.update({scene:'Lobby',players:[p('a','alive','#132ed1')]});
 assert.equal(display.view().length,2);assert.equal(display.view()[1].lifeState,'dead');assert.equal(display.view()[0].color,'#132ed1');time=15000;display.update({scene:'Lobby',players:[]});assert.equal(display.view().length,2);time=20000;display.update({scene:'Lobby',players:[p('a'),p('b')]});assert.equal(display.view()[1].lifeState,'alive');
});
test('終了場面を読み飛ばしてもロビーで保持し、ゲーム開始は最新一覧・生死・色へ置換する',()=>{
 let time=0;const display=new GamePresentation({now:()=>time});display.update({scene:'Tasks',players:[p('a','dead'),p('b','dead')]});time=100;display.update({scene:'Lobby',players:[p('a')]});time=12000;display.update({scene:'Lobby',players:[]});assert.equal(display.view().length,2);time=13000;display.update({scene:'Tasks',players:[]});assert.equal(display.view().length,2);time=13500;display.update({scene:'Tasks',players:[p('a','alive','#132ed1')]});assert.deepEqual(display.view(),[p('a','alive','#132ed1')]);
});
test('明示的な退出は即反映し、欠落・接続断は有限の保持時間後に消す',()=>{
 let time=0;const display=new GamePresentation({now:()=>time});display.update({scene:'Tasks',players:[p('a'),p('b')]});time=100;display.update({scene:'Tasks',players:[p('a')],departedKeys:['b']});assert.equal(display.view().length,1);display.status('error');assert.equal(display.view().length,1);time=10101;assert.equal(display.view().length,0);
 display.status('connected');display.update({scene:'Ended',players:[p('a'),p('b')]});time=11000;display.update({scene:'Lobby',players:[p('a')]});time=71001;display.update({scene:'Lobby',players:[p('a')]});assert.deepEqual(display.view(),[p('a')]);display.status('unsupported');assert.equal(display.view().length,0);
});
test('保持中の保存設定・非表示・対応解除・Discord退出を最新の配信行に反映する',async()=>{
 let time=0;class Client extends EventEmitter{members=[{id:'u-a',name:'A'},{id:'u-b',name:'B'}];channel=null;status='connected';close(){}}
 const client=new Client(),dir=await mkdtemp(path.join(os.tmpdir(),'crew-hold-'));const app=await createApp({directory:dir,allowPlaintextSettings:true,discordClient:client,now:()=>time});
 try{await app.store.save({links:[{gameKey:'a',discordId:'u-a'},{gameKey:'b',discordId:'u-b'}],settings:{}});app.ingestGame({scene:'Ended',players:[p('a'),p('b','dead')]});time=100;app.ingestGame({scene:'Lobby',players:[p('a')]});assert.equal(app.snapshot().rows.filter(r=>r.player&&r.member).length,2);assert.equal(app.snapshot().game.players.length,1);assert.equal(app.snapshot().game.displayPlayers.length,2);
 await app.store.save({links:app.store.current.links,settings:{orientation:'vertical',size:120,nameSize:27,showCharacter:false,bounceSpeaking:true,colorBackground:true}});const snapshot=app.snapshot();assert.equal(snapshot.preset.settings.size,120);assert.equal(snapshot.preset.settings.showCharacter,false);assert.equal(snapshot.rows[1].player.lifeState,'dead');client.members=client.members.slice(0,1);assert.equal(app.snapshot().rows.filter(r=>r.player&&r.member).length,1);await app.store.save({links:[],settings:app.store.current.settings});assert.equal(app.snapshot().rows.length,0);
 }finally{app.shutdown();await rm(dir,{recursive:true,force:true});}
});
