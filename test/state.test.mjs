import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store,cleanGame,cleanLinks} from '../lib/state.mjs';
import {Decoder,frame,Discord} from '../lib/discord.mjs';

test('対応づけ・表示設定を保存し再起動後に復元、別プリセットを分離',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crewlink-'));try{
 const s=new Store(dir);await s.load();await s.save({links:[{gameKey:'account:a',discordId:'123',label:'配信用',visible:true}],settings:{size:100,gap:20}});
 const r=new Store(dir);await r.load();assert.equal(r.current.links[0].label,'配信用');assert.equal(r.current.settings.size,100);
 await r.create('別メンバー');await r.save({links:[],settings:{size:60}});await r.select('default');assert.equal(r.current.links.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('重複したDiscordユーザーやゲームIDを拒否',()=>{
 assert.throws(()=>cleanLinks([{gameKey:'a',discordId:'1'},{gameKey:'b',discordId:'1'}]));
 assert.throws(()=>cleanLinks([{gameKey:'a',discordId:'1'},{gameKey:'a',discordId:'2'}]));
});
test('ゲーム入力の色を検証して危険な文字列を描画に渡さない',()=>{
 assert.throws(()=>cleanGame({players:[{key:'a',color:'red\" onload=evil'}]}));
 const g=cleanGame({players:[{key:'a',name:'Alice',color:'#12ABEF',stable:true}]});assert.equal(g.players[0].stable,true);
});
test('破損した保存ファイルを上書きしない',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crewlink-'));try{const file=path.join(dir,'settings.json');await writeFile(file,'broken');await assert.rejects(new Store(dir).load());assert.equal(await readFile(file,'utf8'),'broken');}finally{await rm(dir,{recursive:true,force:true});}
});
test('Discord IPCの分割受信と複数フレームを処理',()=>{
 const d=new Decoder(),a=frame(1,{evt:'SPEAKING_START',data:{user_id:'a'}}),b=frame(1,{evt:'SPEAKING_STOP',data:{user_id:'a'}});
 assert.deepEqual(d.push(a.subarray(0,3)),[]);const result=d.push(Buffer.concat([a.subarray(3),b]));assert.equal(result.length,2);assert.equal(result[0].data.evt,'SPEAKING_START');assert.equal(result[1].data.evt,'SPEAKING_STOP');
});
test('発言開始・停止と切断が状態に反映される',()=>{
 const d=new Discord();d.channel={id:'voice'};d.members=[{id:'user',speaking:false}];d.dispatch({evt:'SPEAKING_START',data:{user_id:'user'}});assert.equal(d.members[0].speaking,true);d.dispatch({evt:'SPEAKING_STOP',data:{user_id:'user'}});assert.equal(d.members[0].speaking,false);d.close();assert.deepEqual(d.members,[]);
});
