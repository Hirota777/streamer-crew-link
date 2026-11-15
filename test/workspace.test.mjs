import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';import {Store,defaults} from '../lib/state.mjs';import {createApp} from '../server.mjs';
const url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789',links=[{gameKey:'a',gameName:'A',discordId:'345678901234567890',label:'表示名',visible:true}];
const temporary=()=>mkdtemp(path.join(os.tmpdir(),'crew-workspace-'));
test('0.2.3のプリセットと対応づけを保持し、URLを使う選択中の表示方式だけを移行する',async()=>{
 const dir=await temporary();try{
  await writeFile(path.join(dir,'settings.json'),JSON.stringify({schema:2,active:'a',activeDisplay:'x',presets:[{id:'a',name:'メンバー',links,streamkitUrl:url}],displayPresets:[{id:'x',name:'縦',settings:{...defaults,size:110,orientation:'vertical',avatarShape:'round'}},{id:'y',name:'クルー',settings:{...defaults,size:70}}]}));
  const store=new Store(dir,{allowPlaintext:true});await store.load();assert.equal(store.current.settings.displaySource,'streamkit');assert.equal(store.current.settings.size,110);assert.equal(store.current.settings.avatarShape,'round');assert.equal(store.current.links[0].label,'表示名');assert.equal(store.data.displayPresets[1].settings.displaySource,'game');
  const loaded=new Store(dir,{allowPlaintext:true});await loaded.load();assert.deepEqual(loaded.data,store.data);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('見た目だけを名前変更・複製・削除・書き出し・読み込みでき、対応づけを変更しない',async()=>{
 const dir=await temporary();try{const s=new Store(dir,{allowPlaintext:true});await s.load();await s.save({links,streamkitUrl:url,settings:{displaySource:'streamkit',avatarShape:'square'}});const members=structuredClone(s.current.links);
 await s.rename('default','改名','display');await s.create('コピー','default','display');const copy=s.display.id;await s.remove('default','display');await assert.rejects(s.remove(copy,'display'));
 const value=s.exportPreset('display');assert.deepEqual(Object.keys(value.preset).sort(),['name','settings']);await s.importPreset(value);assert.equal(s.data.displayPresets.length,2);assert.deepEqual(s.current.links,members);assert.equal(s.current.streamkitUrl,url);assert.equal(s.data.presets.length,1);
 assert.throws(()=>s.exportPreset('members'));assert.throws(()=>s.cleanImport({...value,kind:'members'}));assert.throws(()=>s.cleanImport({...value,token:'not-allowed'}));assert.throws(()=>s.cleanImport({...value,preset:{name:'empty'}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('設定を暗号化して保存し、バックアップを生成せず、全削除は旧版の既知ファイルだけを掃除する',async()=>{
 const dir=await temporary(),key=randomBytes(32);const cipher={available:async()=>true,encrypt:async text=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decrypt:async bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8');}};
 try{const s=new Store(dir,{cipher});await s.load();await s.save({links,streamkitUrl:url,settings:{size:80}});for(const size of [90,100,110])await s.save({settings:{size}});assert.equal((await readFile(s.file)).includes(Buffer.from('streamkit.discord.com')),false);const {readdir}=await import('node:fs/promises');assert.equal((await readdir(dir)).some(n=>n.includes('.backup-')),false);await writeFile(s.file+'.backup-1','old');await writeFile(path.join(dir,'settings.json.backup-2'),'old');await writeFile(path.join(dir,'unrelated.backup-1'),'keep');await s.reset();assert.equal(s.current.links.length,0);assert.equal(s.current.streamkitUrl,'');assert.equal((await readdir(dir)).some(n=>/^settings\.(?:json|bin)\.backup-/.test(n)),false);assert.equal(await readFile(path.join(dir,'unrelated.backup-1'),'utf8'),'keep');assert.equal(typeof s.backups,'undefined');assert.equal(typeof s.restoreBackup,'undefined');
 }finally{await rm(dir,{recursive:true,force:true});}
});
async function apiFixture(run){const dir=await temporary(),app=await createApp({directory:dir,port:38141,allowPlaintextSettings:true});try{await new Promise(r=>app.server.listen(38141,'127.0.0.1',r));const base='http://127.0.0.1:38141',bootstrap=await(await fetch(base+'/api/bootstrap')).json(),headers={'Content-Type':'application/json','X-App-Token':bootstrap.token};const post=(route,body,h=headers)=>fetch(base+route,{method:'POST',headers:h,body:JSON.stringify(body)});await run({app,base,post});}finally{app.shutdown();await rm(dir,{recursive:true,force:true});}}
test('プレビューは未保存の形状を反映しても保存せず、新しい変更APIもCSRFで保護する',()=>apiFixture(async({app,base,post})=>{
 await app.store.save({links,streamkitUrl:url,settings:{displaySource:'streamkit'}});app.ingestGame({scene:'Lobby',players:[{key:'a',name:'A',color:'#ca243e',colorId:0}]});const before=structuredClone(app.store.data);
 const response=await post('/api/preview',{links,settings:{...defaults,displaySource:'streamkit',avatarShape:'square',nameOpacity:25,orientation:'vertical',verticalNamePosition:'right'}});assert.equal(response.status,200);const preview=await response.json();assert.match(preview.css,/border-radius:0!important/);assert.match(preview.css,/rgba\(17,24,32,0.25\)/);assert.equal(preview.rows.length,1);assert.deepEqual(app.store.data,before);
 assert.equal((await post('/api/presets/delete',{id:app.store.current.id,kind:'members'},{'Content-Type':'application/json'})).status,403);
 assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://example.com'}})).status,403);
 assert.equal((await post('/api/presets/import-preview',{value:app.store.exportPreset('display')})).status,200);
}));
test('デモの人数や状態は配信用イベントに混ざらず、表示方式の切替でStreamkit連携を停止する',()=>apiFixture(async({app,base,post})=>{
 await app.store.save({links,streamkitUrl:url,settings:{displaySource:'streamkit'}});app.ingestGame({scene:'Lobby',players:[{key:'a',name:'実データ',color:'#ca243e',colorId:0}]});assert.equal((await post('/api/obs/export',{enabled:true})).status,200);
 await post('/api/demo',{enabled:true});const preview=await(await post('/api/preview',{links:[],settings:{displaySource:'streamkit'},sampleCount:3})).json();assert.equal(preview.rows.length,3);
 async function event(route){const response=await fetch(base+route),reader=response.body.getReader();let text='';while(!text.includes('\n\n')){const item=await reader.read();text+=new TextDecoder().decode(item.value);}await reader.cancel();return JSON.parse(text.split('\n\n')[0].slice(6));}
 const gui=await event('/api/events'),live=await event('/api/live-events');assert.equal(gui.mode,'demo');assert.equal(gui.game.players.length,11);assert.equal(live.mode,'live');assert.equal(live.preset.settings.displaySource,'game');assert.equal(live.game.players[0].name,'実データ');assert.equal(live.game.players.length,1);
 await post('/api/demo',{enabled:false});await post('/api/save',{settings:{displaySource:'game'}});await new Promise(r=>setTimeout(r,350));assert.equal(app.obsExport.enabled,false);
}));
test('任意の自動開始は保存したStreamkit方式とURLが揃うときだけ実行する',async()=>{
 const dir=await temporary();let app;try{const s=new Store(dir,{allowPlaintext:true});await s.load();await s.save({links,streamkitUrl:url,settings:{displaySource:'streamkit'}});await s.preferences({autoStartObs:true});app=await createApp({directory:dir,allowPlaintextSettings:true});assert.equal(app.obsExport.enabled,true);app.shutdown();await app.store.save({settings:{displaySource:'game'}});app=await createApp({directory:dir,allowPlaintextSettings:true});assert.equal(app.obsExport.enabled,false);assert.equal(app.store.current.links[0].label,'表示名');}finally{app?.shutdown();await rm(dir,{recursive:true,force:true});}
});
