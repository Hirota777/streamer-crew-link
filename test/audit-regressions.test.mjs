import {test} from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../server.mjs';import {Discord} from '../lib/discord.mjs';import http from 'node:http';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
test('UTF-8文字の途中でHTTP本文が分割されても表示名を正しく保存する',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-http-utf8-')),port=37948,app=await createApp({directory,port,allowPlaintextSettings:true});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));try{
  const bootstrap=await(await fetch('http://127.0.0.1:'+port+'/api/bootstrap')).json(),label='配信用の名前',payload=Buffer.from(JSON.stringify({links:[{gameKey:'game',discordId:'discord',label}],settings:{}}));const split=payload.indexOf(Buffer.from(label))+1;
  const response=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/api/save',method:'POST',headers:{'X-App-Token':bootstrap.token}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.write(payload.subarray(0,split));setTimeout(()=>req.end(payload.subarray(split)),20);});assert.equal(response.status,200);assert.equal(response.body.preset.links[0].label,label);
  const cleared=await fetch('http://127.0.0.1:'+port+'/api/data/clear',{method:'POST',headers:{'X-App-Token':bootstrap.token},body:'{}'});assert.equal(cleared.status,200);assert.deepEqual((await cleared.json()).preset.links,[]);
 }finally{app.shutdown();await rm(directory,{recursive:true,force:true});}
});
test('テキスト・個人通話をサーバー通話として表示せず、サーバー音声を受理する',async()=>{
 const d=new Discord();d.close();d.targetId='target';try{for(const type of [0,1,3,4,2,13]){d.call=async cmd=>cmd==='GET_CHANNEL'?{id:'target',guild_id:type===1||type===3?null:'server',type,name:'test',voice_states:[]}:{};await d.refresh();assert.equal(d.status==='接続中',type===2||type===13);assert.equal(d.channel!==null,type===2||type===13);}}finally{d.close();}
});
