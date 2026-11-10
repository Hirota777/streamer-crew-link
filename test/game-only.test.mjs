import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createApp} from '../server.mjs';import {Store,cleanSettings} from '../lib/state.mjs';
async function fixture(run){const directory=await mkdtemp(path.join(os.tmpdir(),'crew-game-only-')),app=await createApp({directory,allowPlaintextSettings:true});try{await run(app,directory);}finally{app.shutdown();await rm(directory,{recursive:true,force:true});}}
test('Discord不要モードでゲーム内の名前とクルーを対応づけなしで自動表示する',()=>fixture(async app=>{
 await app.store.save({links:[],settings:{displaySource:'game'}});for(const colorSource of ['vanilla','nebula','snr']){app.ingestGame({scene:'Lobby',lifeTracking:true,players:[{key:'p',name:'ゲーム内の名前',color:'#123456',shadowColor:'#012345',visorColor:'#95CADC',colorSource,colorId:colorSource==='snr'?28:0,lifeState:'alive'}]});const s=app.snapshot();assert.equal(s.discord.members.length,0);assert.equal(s.rows.length,1);assert.equal(s.rows[0].player.name,'ゲーム内の名前');assert.equal(s.rows[0].member,null);assert.equal(s.rows[0].player.colorSource,colorSource);assert.equal(s.unmapped,0);}
}));
test('ゲームのみモードを保存・復元し、Discord対応づけを保持したまま切替できる',()=>fixture(async(app,directory)=>{
 const links=[{gameKey:'p',discordId:'user',label:'Discord用の表示名',visible:false}];await app.store.save({links,settings:{displaySource:'game',orientation:'vertical'}});const restored=new Store(directory,{allowPlaintext:true});await restored.load();assert.equal(restored.current.settings.displaySource,'game');assert.equal(restored.current.links[0].label,'Discord用の表示名');app.ingestGame({players:[{key:'p',name:'ゲーム名',color:'#c51111'}]});assert.equal(app.snapshot().rows[0].visible,true);await app.store.save({links:restored.current.links,settings:{displaySource:'discord'}});assert.equal(app.snapshot().rows[0].visible,false);assert.equal(app.snapshot().rows[0].member,null);assert.equal(app.snapshot().rows[0].label,'Discord用の表示名');
}));
test('ゲームのみでも会議で確定した死亡・保持中の一覧・明示退出を反映する',()=>fixture(async app=>{
 await app.store.save({links:[],settings:{displaySource:'game'}});const p={key:'p',name:'A',color:'#c51111',lifeState:'exiled'};app.ingestGame({scene:'Ended',players:[p]});app.ingestGame({scene:'Lobby',players:[]});assert.equal(app.snapshot().rows[0].player.lifeState,'exiled');app.ingestGame({scene:'Lobby',players:[],departedKeys:['p']});assert.equal(app.snapshot().rows.length,0);
}));
test('旧設定はDiscord連携を維持し、不正な表示モードを拒否する',()=>{assert.equal(cleanSettings({}).displaySource,'discord');assert.throws(()=>cleanSettings({displaySource:'invalid'}));});

import {EventEmitter} from 'node:events';import {APPLICATION} from '../lib/application.mjs';
test('ゲームのみで起動すると保存認証があってもDiscordへの接続を開始しない',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-game-only-start-'));let app;
 try{const store=new Store(directory,{allowPlaintext:true});await store.load();await store.save({links:[],settings:{displaySource:'game'}});const record={schema:1,credentials:{...APPLICATION},tokens:{accessToken:'synthetic-only',expiresAt:Date.now()+3600000}};const vault={available:async()=>true,load:async()=>record,save:async()=>{},clear:async()=>{}};class Client extends EventEmitter{members=[];channel=null;status='未接続';calls=0;async connect(){this.calls++}close(){}}const client=new Client();app=await createApp({directory,allowPlaintextSettings:true,credentialVault:vault,discordClient:client});await app.startDiscord();assert.equal(client.calls,0);assert.equal(app.snapshot().discord.auth.saved,true);
 }finally{app?.shutdown();await rm(directory,{recursive:true,force:true});}
});
