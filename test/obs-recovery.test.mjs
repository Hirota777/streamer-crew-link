import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';import os from 'node:os';
import {ObsStyleExport} from '../lib/obs-style.mjs';
import {defaults} from '../lib/state.mjs';
import {createApp} from '../server.mjs';
const state=(label='initial')=>({preset:{settings:{...defaults},streamkitUrl:'https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789',links:[{gameKey:'p',discordId:'800000000000000001',label}]},game:{displayPlayers:[{key:'p',name:'P',color:'#38e7df',colorId:10,lifeState:'alive'}]}});
function fixture(t,run){
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const directory=mkdtempSync(path.join(os.tmpdir(),'obs-recovery-')),bridge=new ObsStyleExport(directory),write=bridge.write.bind(bridge);let blocked='';const writes=[];
 bridge.write=(name,data)=>{if(name===blocked)throw Error('sharing violation');writes.push(name);return write(name,data);};
 try{bridge.setEnabled(true,state());run({bridge,writes,block:name=>blocked=name,read:name=>JSON.parse(readFileSync(path.join(bridge.directory,name),'utf8'))});}
 finally{bridge.close();rmSync(directory,{recursive:true,force:true});}
}
test('ハートビート失敗後に2秒で最新の設定・死亡・URLを再生成し、成功後は通常更新へ戻る',t=>fixture(t,({bridge,writes,block,read})=>{
 block('streamkit-status.json');bridge.status();assert.equal(bridge.view().recovering,true);assert.equal(bridge.view().enabled,false);
 const latest=state('updated');latest.game.displayPlayers[0].lifeState='dead';latest.preset.settings.size=120;latest.preset.streamkitUrl=latest.preset.streamkitUrl.replace('234567890123456789','456789012345678901');bridge.update(latest);
 block('');t.mock.timers.tick(1999);assert.equal(bridge.enabled,false);t.mock.timers.tick(1);
 assert.equal(bridge.enabled,true);assert.equal(bridge.view().recovering,false);assert.equal(bridge.view().error,'');assert.equal(bridge.view().retryAttempts,0);
 assert.equal(read('streamkit-style.json').url,latest.preset.streamkitUrl);assert.match(read('streamkit-style.json').css,/120px/);assert.match(read('streamkit-style.json').css,/data:image\/svg/);assert.equal(read('streamkit-status.json').active,true);
 const count=writes.filter(n=>n==='streamkit-style.json').length;bridge.update(latest);bridge.status();t.mock.timers.tick(30000);assert.equal(writes.filter(n=>n==='streamkit-style.json').length,count,'復旧後に同じ表示を書き直さない');
}));
test('連続失敗は2秒・5秒・10秒・以降30秒で再試行し、状態配信や保存で待機をリセットしない',t=>fixture(t,({bridge,block})=>{
 block('streamkit-status.json');bridge.status();
 for(const delay of [2000,5000,10000,30000,30000]){
  const next=bridge.view().nextRetryAt;bridge.update(state());assert.equal(bridge.view().nextRetryAt,next);
  assert.equal(next-Date.now(),delay);t.mock.timers.tick(delay-1);assert.equal(bridge.view().nextRetryAt,next);t.mock.timers.tick(1);
 }
 assert.equal(bridge.view().retryAttempts,6);assert.equal(bridge.view().recovering,true);
}));
for(const stop of ['manual','url','mode','close'])test(`復旧待ち中の${stop}で再試行を取り消す`,t=>fixture(t,({bridge,writes,block})=>{
 block('streamkit-status.json');bridge.status();block('');
 const next=state();if(stop==='manual')bridge.setEnabled(false,next);if(stop==='url'){next.preset.streamkitUrl='';bridge.update(next);}if(stop==='mode'){next.preset.settings.displaySource='game';bridge.update(next);}if(stop==='close')bridge.close();
 assert.equal(JSON.parse(readFileSync(path.join(bridge.directory,'streamkit-status.json'),'utf8')).active,false);
 const count=writes.length;t.mock.timers.tick(120000);assert.equal(bridge.enabled,false);assert.equal(bridge.view().recovering,false);assert.equal(bridge.view().nextRetryAt,null);assert.equal(writes.length,count);
}));
test('表示ファイルの書込失敗後も同じrevisionのファイルを確実に書き直す',t=>fixture(t,({bridge,block,read})=>{
 const next=state('new');block('streamkit-style.json');bridge.flush(next);assert.equal(bridge.enabled,false);block('');t.mock.timers.tick(2000);
 assert.equal(bridge.enabled,true);assert.equal(read('streamkit-style.json').revision,read('streamkit-status.json').revision);
}));
test('初回のスクリプト書込失敗も復旧できる',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});const directory=mkdtempSync(path.join(os.tmpdir(),'obs-start-recovery-'));writeFileSync(path.join(directory,'obs-streamkit'),'blocked');const bridge=new ObsStyleExport(directory);
 try{assert.throws(()=>bridge.setEnabled(true,state()));assert.equal(bridge.view().recovering,true);unlinkSync(path.join(directory,'obs-streamkit'));t.mock.timers.tick(2000);assert.equal(bridge.enabled,true);assert.match(readFileSync(path.join(bridge.directory,'streamer-crew-link.lua'),'utf8'),/script_description/);}
 finally{bridge.close();rmSync(directory,{recursive:true,force:true});}
});
test('連携用の表示ファイルが消えた場合も、ハートビートで検出して再生成する',t=>fixture(t,({bridge,read})=>{
 unlinkSync(path.join(bridge.directory,'streamkit-style.json'));bridge.status();assert.equal(bridge.view().recovering,true);t.mock.timers.tick(2000);assert.equal(bridge.enabled,true);assert.equal(read('streamkit-style.json').revision,read('streamkit-status.json').revision);
}));
test('デモ中の自動復旧は実ゲームの最新情報を使い、デモを配信しない',async()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'obs-demo-recovery-'));const app=await createApp({directory,allowPlaintextSettings:true,port:38587});
 try{
  await new Promise(r=>app.server.listen(38587,'127.0.0.1',r));const base='http://127.0.0.1:38587',boot=await(await fetch(base+'/api/bootstrap')).json();
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':boot.token},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  await post('/api/save',{settings:defaults,links:state().preset.links,streamkitUrl:state().preset.streamkitUrl});app.ingestGame({scene:'Lobby',players:state().game.displayPlayers});
  app.obsExport.retryDelays=[100];const write=app.obsExport.write.bind(app.obsExport);app.obsExport.write=()=>{throw Error('locked');};app.obsExport.status();app.obsExport.write=write;
  await post('/api/demo',{enabled:true});const live=state().game.displayPlayers;live[0].lifeState='dead';app.ingestGame({scene:'Lobby',players:live});
  for(let i=0;i<50&&!app.obsExport.enabled;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(app.obsExport.enabled,true);assert.equal(app.obsExport.view().present,1);const generated=JSON.parse(readFileSync(path.join(app.obsExport.directory,'streamkit-style.json'),'utf8'));assert.match(generated.css,/data:image\/svg/);assert.doesNotMatch(generated.css,/demo-game/);
  app.obsExport.write=()=>{throw Error('locked');};app.obsExport.status();app.obsExport.write=write;
  const value=app.store.exportSettings(),preview=await post('/api/settings/import-preview',{value});await post('/api/settings/import',{value,baseFingerprint:preview.baseFingerprint});await new Promise(r=>setTimeout(r,150));assert.equal(app.obsExport.requested,false);assert.equal(app.obsExport.enabled,false);
 }finally{app.shutdown();rmSync(directory,{recursive:true,force:true});}
});
