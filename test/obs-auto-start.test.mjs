import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server.mjs';
import {Store} from '../lib/state.mjs';

const url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789';
async function fixture(run){
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-obs-auto-'));
 const app=await createApp({directory,port:38577,allowPlaintextSettings:true});
 try{
  await new Promise(r=>app.server.listen(38577,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port;
  const headers={'Content-Type':'application/json'};
  const initial=await(await fetch(base+'/api/bootstrap',{headers})).json();
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{...headers,'X-App-Token':initial.token},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json();};
  await run({app,directory,post});
 }finally{app.shutdown();await rm(directory,{recursive:true,force:true});}
}

test('初回は保存済みの方式とURLが揃った時だけ自動開始し、次回起動でも再開する',()=>fixture(async({app,directory,post})=>{
 assert.equal(app.store.data.preferences.autoStartObs,true);
 assert.equal(app.obsExport.enabled,false);
 assert.equal(app.store.current.settings.displaySource,'streamkit');
 await post('/api/save',{settings:{displaySource:'game'}});
 await post('/api/streamkit/save',{name:'通話',url,expectedActiveId:''});
 assert.equal(app.obsExport.enabled,false,'クルーのみでは開始しない');
 await post('/api/save',{settings:{displaySource:'streamkit'}});
 assert.equal(app.obsExport.enabled,true);
 assert.match(await readFile(path.join(directory,'obs-streamkit','streamer-crew-link.lua'),'utf8'),/script_description/);
 assert.equal(JSON.parse(await readFile(path.join(directory,'obs-streamkit','streamkit-status.json'),'utf8')).active,true);
 app.shutdown();
 const next=await createApp({directory,allowPlaintextSettings:true});
 try{assert.equal(next.obsExport.enabled,true);}finally{next.shutdown();}
}));

test('方式の切替・表示先削除で停止し、設定が揃うと再開する。一時停止は保存やデモ終了で解除しない',()=>fixture(async({app,post})=>{
 await post('/api/save',{settings:{displaySource:'streamkit'}});
 const saved=await post('/api/streamkit/save',{name:'通話',url,expectedActiveId:''});
 assert.equal(app.obsExport.enabled,true);
 await post('/api/obs/export',{enabled:false});
 await post('/api/save',{settings:{displaySource:'streamkit',size:100}});
 await post('/api/demo',{enabled:true});await post('/api/demo',{enabled:false});
 assert.equal(app.obsExport.enabled,false);
 await post('/api/obs/export',{enabled:true});
 await post('/api/save',{settings:{displaySource:'game'}});assert.equal(app.obsExport.enabled,false);
 await post('/api/save',{settings:{displaySource:'streamkit'}});assert.equal(app.obsExport.enabled,true);
 await post('/api/streamkit/delete',{id:saved.streamkitSavedId,revision:1});assert.equal(app.obsExport.enabled,false);
 await post('/api/demo',{enabled:true});
 await post('/api/streamkit/save',{name:'新しい通話',url,expectedActiveId:''});assert.equal(app.obsExport.enabled,false);
 await post('/api/demo',{enabled:false});assert.equal(app.obsExport.enabled,true);
}));

test('自動連携のオフを保持し、オンにすればその場で開始する。読み込み後は確認して再開する',()=>fixture(async({app,directory,post})=>{
 await post('/api/preferences',{autoStartObs:false});
 await post('/api/save',{settings:{displaySource:'streamkit'},streamkitUrl:url});
 assert.equal(app.obsExport.enabled,false);
 const loaded=new Store(directory,{allowPlaintext:true});await loaded.load();assert.equal(loaded.data.preferences.autoStartObs,false);
 await post('/api/preferences',{autoStartObs:true});assert.equal(app.obsExport.enabled,true);
 const value=app.store.exportSettings(),preview=await post('/api/settings/import-preview',{value});
 await post('/api/settings/import',{value,baseFingerprint:preview.baseFingerprint});
 await post('/api/save',{settings:{displaySource:'streamkit',size:99}});assert.equal(app.obsExport.enabled,false);
 await post('/api/obs/export',{enabled:true});assert.equal(app.obsExport.enabled,true);
}));

test('自動生成失敗は保存結果と切り離して表示し、再開で復旧できる',()=>fixture(async({app,post})=>{
 const start=app.obsExport.setEnabled.bind(app.obsExport);
 app.obsExport.setEnabled=()=>{throw Error('write failure');};
 const saved=await post('/api/save',{settings:{displaySource:'streamkit'},streamkitUrl:url});
 assert.equal(saved.preset.streamkitUrl,url);assert.equal(saved.obs.enabled,false);assert.match(saved.obs.error,/自動で開始できません/);
 app.obsExport.setEnabled=start;
 await post('/api/obs/export',{enabled:true});assert.equal(app.obsExport.enabled,true);assert.equal(app.obsExport.view().error,'');
}));
