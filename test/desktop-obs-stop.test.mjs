import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {createRequire} from 'node:module';import {readFileSync,mkdtempSync,rmSync} from 'node:fs';import path from 'node:path';import os from 'node:os';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
for(const delivered of [true,false])test(`終了時の停止通知${delivered?'成功では警告しない':'失敗はOBS手動停止を案内する'}`,()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'crew-desktop-stop-')),events=[];
 const app=Object.assign(new EventEmitter(),{isPackaged:false,setName(){},setPath(){},requestSingleInstanceLock:()=>true,whenReady:()=>({then(){}})});
 const context=vm.createContext({require:name=>name==='electron'?{app,dialog:{showErrorBox:(title,message)=>events.push({kind:'warning',title,message})}}:require(name),__dirname:root,process:{env:{STREAMER_CREW_LINK_PROFILE:dir}},events,delivered});
 try{
  vm.runInContext(readFileSync(path.join(root,'desktop.cjs'),'utf8'),context);
  vm.runInContext("stopReader=()=>events.push({kind:'reader'});local={obsExport:{close:()=>{events.push({kind:'stop'});return delivered;}},shutdown:()=>events.push({kind:'shutdown'})};app.emit('will-quit');",context);
  assert.deepEqual(events.map(e=>e.kind),delivered?['reader','stop','shutdown']:['reader','stop','warning','shutdown']);
  if(!delivered){assert.match(events[2].message,/OBS/);assert.match(events[2].message,/同期のチェックを外して/);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
