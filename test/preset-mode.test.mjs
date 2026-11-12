import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {createApp} from '../server.mjs';
let nextPort=37977;
async function fixture(run){
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-mode-save-'));
 const port=nextPort++;
 const app=await createApp({directory,port,allowPlaintextSettings:true});
 await app.store.save({links:[{gameKey:'name:A',discordId:'user-a',label:'original'}],settings:{size:80}});
 await new Promise(resolve=>app.server.listen(port,'127.0.0.1',resolve));
 const token=(await fetch(`http://127.0.0.1:${port}/api/bootstrap`).then(r=>r.json())).token;
 const post=async(route,body)=>{
  const response=await fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(body)});
  return {status:response.status,data:await response.json()};
 };
 try{await run({app,post});}finally{app.shutdown();await rm(directory,{recursive:true,force:true});}
}
test('本番の保存がデモ切替後に到着したら、対応づけを捨てて成功にせず保存全体を拒否する',()=>fixture(async({app,post})=>{
 const before=structuredClone(app.store.data);
 assert.equal((await post('/api/demo',{enabled:true})).status,200);
 const result=await post('/api/save',{presetId:'default',mode:'live',links:[{gameKey:'name:A',discordId:'user-a',label:'changed'}],settings:{size:120}});
 assert.equal(result.status,400);assert.match(result.data.error,/表示モード/);assert.deepEqual(app.store.data,before);
}));
test('デモの保存が本番復帰後に到着しても、設定や対応づけを書き換えない',()=>fixture(async({app,post})=>{
 await post('/api/demo',{enabled:true});await post('/api/demo',{enabled:false});
 const before=structuredClone(app.store.data);
 const result=await post('/api/save',{presetId:'default',mode:'demo',settings:{size:120}});
 assert.equal(result.status,400);assert.match(result.data.error,/表示モード/);assert.deepEqual(app.store.data,before);
}));
test('モードが一致する本番保存とデモの見た目保存は成功し、デモでは対応づけを保つ',()=>fixture(async({app,post})=>{
 const links=[{gameKey:'name:A',discordId:'user-a',label:'changed'}];
 assert.equal((await post('/api/save',{presetId:'default',mode:'live',links,settings:{size:120}})).status,200);
 assert.equal(app.store.current.links[0].label,'changed');
 await post('/api/demo',{enabled:true});
 assert.equal((await post('/api/save',{presetId:'default',mode:'demo',settings:{size:100}})).status,200);
 assert.equal(app.store.current.links[0].label,'changed');assert.equal(app.store.current.settings.size,100);
}));
