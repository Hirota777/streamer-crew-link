import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';
import {EventEmitter} from 'node:events';

test('外部読取、色の反映、保存、デモ分離、透明OBSページ',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crewlink-server-'));
 const port=37932,app=await createApp({allowPlaintextSettings:true,directory,port});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const base=`http://127.0.0.1:${port}`;
 try{
 const b=await(await fetch(base+'/api/bootstrap')).json();
 const send=(route,data,headers={})=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 assert.equal((await send('/api/save',{})).status,403);
 const game={version:'test',modVersion:'test',players:[{key:'alice',name:'アリス',color:'#ee3311',stable:true}]};
 assert.equal((await send('/api/game',game)).status,403);
 app.ingestGame(game);
 const headers={'X-App-Token':b.token};
 assert.equal((await send('/api/save',{links:[{gameKey:'alice',discordId:'discord-alice'}],settings:{size:90}},headers)).status,200);
 let s=await(await fetch(base+'/api/state')).json();assert.equal(s.rows[0].player.color,'#ee3311');assert.equal(s.rows[0].member,null);
 game.players[0].color='#1122ff';app.ingestGame(game);s=await(await fetch(base+'/api/state')).json();assert.equal(s.rows[0].player.color,'#1122ff');
 await send('/api/demo',{enabled:true},headers);s=await(await fetch(base+'/api/state')).json();assert.equal(s.mode,'demo');assert.equal(s.rows.length,11);
 assert.equal((await send('/api/save',{links:[{gameKey:'demo-game-0',discordId:'demo-user-0'}],settings:{orientation:'vertical',nameSize:26}},headers)).status,200);
 s=await(await fetch(base+'/api/state')).json();assert.equal(s.mode,'demo');assert.equal(s.preset.links[0].gameKey,'alice');assert.equal(s.preset.settings.nameSize,26);assert.equal(s.preset.settings.orientation,'vertical');
 assert.equal((await send('/api/save',{settings:{nameSize:100}},headers)).status,400);assert.equal(app.store.current.settings.nameSize,26);
 const restored=new (await import('../lib/state.mjs')).Store(directory,{allowPlaintext:true});await restored.load();assert.equal(restored.current.settings.nameSize,26);assert.equal(restored.current.links[0].gameKey,'alice');
 await send('/api/demo',{enabled:false},headers);s=await(await fetch(base+'/api/state')).json();assert.equal(s.preset.links[0].gameKey,'alice');
 const overlay=await(await fetch(base+'/overlay')).text();assert.match(overlay,/class="overlay"/);assert.doesNotMatch(overlay,/Client Secret/);
 assert.equal((await fetch(base+'/icons/aucyan.png')).headers.get('content-type'),'image/png');assert.equal((await fetch(base+'/icons/aucyandead.png')).status,200);
 assert.equal((await send('/api/game',game,headers)).status,404);
 app.setReaderStatus('unsupported','未対応');s=await(await fetch(base+'/api/state')).json();assert.equal(s.game.online,false);assert.equal(s.reader.status,'unsupported');
 assert.equal((await send('/api/save',{links:[],settings:{}},{...headers,Origin:'https://example.com'})).status,403);
 }finally{await new Promise(r=>app.server.close(r));await rm(directory,{recursive:true,force:true});}
});

test('APIやOBSへ認証情報を返さず、初回連携・保存・削除を制御できる',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crewlink-auth-api-'));let record=null;
 class Client extends EventEmitter {members=[];channel=null;status='未接続';async connect(options){if(options.interactive)await options.onToken({accessToken:'test-private-access',refreshToken:'test-private-refresh',expiresAt:Date.now()+3600000});this.status='接続中';this.channel={id:'voice',name:'テスト'};this.emit('change');}close(){this.members=[];this.channel=null;this.emit('change');}}
 const vault={available:async()=>true,load:async()=>record,save:async r=>{record=r;},clear:async()=>{record=null;}};
 const port=37933,app=await createApp({allowPlaintextSettings:true,directory,port,credentialVault:vault,discordClient:new Client()});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const base=`http://127.0.0.1:${port}`;
 try{
  const initial=await(await fetch(base+'/api/bootstrap')).json();const headers={'Content-Type':'application/json','X-App-Token':initial.token};
  const connected=await fetch(base+'/api/discord/connect',{method:'POST',headers,body:JSON.stringify({clientId:'123456789012345678',clientSecret:'test-private-secret',remember:true})});assert.equal(connected.status,200);
  const serialized=await connected.text();for(const secret of ['test-private-access','test-private-refresh','test-private-secret'])assert.equal(serialized.includes(secret),false);
  assert.equal(JSON.parse(serialized).discord.auth.saved,true);
  const stateText=await(await fetch(base+'/api/state')).text();assert.equal(stateText.includes('test-private-secret'),false);
  assert.equal((await fetch(base+'/api/discord/forget',{method:'POST',body:'{}'})).status,403);
  await fetch(base+'/api/discord/forget',{method:'POST',headers,body:'{}'});assert.equal(record,null);assert.equal(app.snapshot().discord.auth.saved,false);
 }finally{app.shutdown();await rm(directory,{recursive:true,force:true});}
});
