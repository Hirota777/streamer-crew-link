import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';import {EventEmitter} from 'node:events';
import {cleanStreamkitUrl} from '../public/streamkit.js';import {Store} from '../lib/state.mjs';import {createApp} from '../server.mjs';
const url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789?text_color=%23ffffff&limit_speaking=false';
test('公式Voice表示URLを検証し、表示パラメーターを維持する',()=>{
 assert.equal(cleanStreamkitUrl('  '+url+'  '),url);assert.equal(cleanStreamkitUrl(), '');assert.equal(cleanStreamkitUrl(''),'');assert.throws(()=>cleanStreamkitUrl(url+'&x='+('あ'.repeat(1000))));assert.match(cleanStreamkitUrl(url+'&x=日本'),/%E6%97%A5%E6%9C%AC/);
 for(const bad of ['https://streamkit.discord.com/overlay','https://streamkit.discord.com/overlay/chat/123456789012345678/234567890123456789','http:'+url.slice(6),url.replace('streamkit.discord.com','streamkit.discord.com.evil.test'),url.replace('https://','https://user:pass@'),url.replace('.com/','.com:444/'),url+'#fragment',url+'&access_token=secret',url+'&%63ode=secret',url+'\n?x=1',url.replace('123456789012345678','not-an-id'),{},null,url+'&x='+('a'.repeat(8200))])assert.throws(()=>cleanStreamkitUrl(bad));
});
test('URLを共通設定へ暗号化保存し、表示プリセットと独立して再起動・解除できる',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-streamkit-')),key=randomBytes(32);
 const cipher={available:async()=>true,encrypt:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decrypt:async bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8');}};
 try{
  const s=new Store(dir,{cipher});await s.load();await s.save({streamkitUrl:url});assert.equal(s.current.streamkitUrl,url);
  const bytes=await readFile(s.file);assert.equal(bytes.includes(Buffer.from('streamkit.discord.com')),false);
  await s.create('別の配信画面',undefined,'display',{settings:{orientation:'vertical'}});assert.equal(s.current.streamkitUrl,url);
  const loaded=new Store(dir,{cipher});await loaded.load();assert.equal(loaded.current.streamkitUrl,url);assert.equal(loaded.current.settings.orientation,'vertical');
  await loaded.save({streamkitUrl:''});await loaded.select('default','display');assert.equal(loaded.current.streamkitUrl,'');assert.equal(loaded.data.presets.length,1);
  const before=structuredClone(loaded.data);await assert.rejects(loaded.save({streamkitUrl:'https://example.com'}));assert.deepEqual(loaded.data,before);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('URL保存APIは本人確認済み管理要求だけを受け付け、デモの対応づけを保存せずRPCを開始しない',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-streamkit-api-'));let app;
 class Client extends EventEmitter{members=[];channel=null;status='未接続';calls=0;async connect(){this.calls++;}close(){}}
 const client=new Client();
 try{
  app=await createApp({directory:dir,port:37995,allowPlaintextSettings:true,discordClient:client});await new Promise(r=>app.server.listen(37995,'127.0.0.1',r));const base='http://127.0.0.1:37995';
  const bootstrap=await(await fetch(base+'/api/bootstrap')).json(),headers={'Content-Type':'application/json','X-App-Token':bootstrap.token};
  const post=(route,body,h=headers)=>fetch(base+route,{method:'POST',headers:h,body:JSON.stringify(body)});
  assert.equal((await post('/api/save',{streamkitUrl:url},{'Content-Type':'application/json'})).status,403);
  assert.equal((await post('/api/save',{streamkitUrl:url,settings:{displaySource:'streamkit'}})).status,200);assert.equal(app.snapshot().preset.streamkitUrl,url);
  assert.equal((await post('/api/obs/export',{enabled:true},{'Content-Type':'application/json'})).status,403);
  assert.equal((await post('/api/obs/export',{enabled:true})).status,200);assert.equal(app.snapshot().obs.enabled,true);
  assert.equal((await post('/api/obs/export',{enabled:false})).status,200);assert.equal(app.snapshot().obs.enabled,false);
  await app.store.save({links:[{gameKey:'real',discordId:'real-user'}]});await post('/api/demo',{enabled:true});
  assert.equal((await post('/api/obs/export',{enabled:true})).status,400);
  assert.equal((await post('/api/save',{streamkitUrl:'',links:[{gameKey:'demo',discordId:'demo-user'}]})).status,200);assert.equal(app.store.current.links[0].gameKey,'real');assert.equal(app.store.current.streamkitUrl,'');
  await app.startDiscord();assert.equal(client.calls,0);assert.equal((await post('/api/discord/connect',{})).status,400);assert.equal(client.calls,0);
  assert.equal((await post('/api/save',{streamkitUrl:url+'&token=private'})).status,400);assert.equal(app.store.current.streamkitUrl,'');
  assert.equal((await fetch(base+'/streamkit.js')).status,200);
 }finally{app?.shutdown();await rm(dir,{recursive:true,force:true});}
});
test('公開版の後継の製品識別子と初回削除を設定しRPCを再開しない',async()=>{
 const desktop=await readFile(new URL('../desktop.cjs',import.meta.url),'utf8'),preload=await readFile(new URL('../preload.cjs',import.meta.url),'utf8'),msi=await readFile(new URL('../scripts/build-msi.mjs',import.meta.url),'utf8');
 assert.match(desktop,/productName='Streamer crew link'/);assert.match(desktop,/37891/);assert.match(desktop,/setupUpdates/);assert.match(desktop,/prepareFreshRelease/);assert.doesNotMatch(desktop,/migrationMarker|copyFileSync|new CredentialVault/);assert.match(preload,/crew-link:update/);assert.match(msi,/8FAFDAD1-280D-478C-A7ED-30FBEA4B5C72/);assert.doesNotMatch(msi,/B96A482A-0579-4D1E-9F52-AEE8ED1B7C16/);
});
