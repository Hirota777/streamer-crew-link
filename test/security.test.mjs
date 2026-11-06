import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../server.mjs';

test('外部サイトの読取・変更と偽Hostを拒否し、OAuthの外部からの戻りはstateで検証',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crewlink-security-'));const port=37934,app=await createApp({directory,port});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const base=`http://127.0.0.1:${port}`;
 try{
  for(const route of ['/','/overlay','/api/bootstrap','/api/state','/api/events','/app.js']){
   assert.equal((await fetch(base+route,{headers:{Origin:'https://untrusted.example'}})).status,403);
   assert.equal((await fetch(base+route,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  }
  const response=await fetch(base+'/');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(response.headers.get('x-frame-options'),'DENY');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');
  const boot=await fetch(base+'/api/bootstrap');assert.equal(boot.headers.get('cache-control'),'no-store');const {token}=await boot.json();
  assert.equal((await fetch(base+'/api/demo',{method:'POST',headers:{'X-App-Token':token,Origin:'https://untrusted.example'},body:'{"enabled":true}'})).status,403);
  const forgedHost=await new Promise((resolve,reject)=>{const req=http.get(base+'/api/bootstrap',{headers:{Host:'untrusted.example:'+port}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(forgedHost,403);
  const callback=await fetch(base+'/oauth/callback?state=forged&code=forged',{headers:{'Sec-Fetch-Site':'cross-site'}});assert.equal(callback.status,409);
  assert.equal((await fetch(base+'/preload.cjs')).status,404);assert.equal((await fetch(base+'/lib/vault.mjs')).status,404);assert.equal((await fetch(base+'/discord-auth.bin')).status,404);
  assert.equal(app.snapshot().mode,'live');
 }finally{app.shutdown();await rm(directory,{recursive:true,force:true});}
});
test('表示接続数を制限し、閉じた接続は再利用できる',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crewlink-stream-limit-'));const port=37935,app=await createApp({directory,port});
 await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const base=`http://127.0.0.1:${port}`;const connections=[];
 try{
  for(let i=0;i<32;i++){const controller=new AbortController();const response=await fetch(base+'/api/events',{signal:controller.signal});connections.push({controller,response});assert.equal(response.status,200);}
  assert.equal((await fetch(base+'/api/events')).status,429);
  connections.pop().controller.abort();await new Promise(r=>setTimeout(r,20));
  const controller=new AbortController();const response=await fetch(base+'/api/events',{signal:controller.signal});connections.push({controller,response});assert.equal(response.status,200);
 }finally{connections.forEach(c=>c.controller.abort());app.shutdown();await rm(directory,{recursive:true,force:true});}
});
