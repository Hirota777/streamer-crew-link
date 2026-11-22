import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ObsStyleExport} from '../lib/obs-style.mjs';import {defaults} from '../lib/state.mjs';
const state=()=>({preset:{settings:{...defaults},streamkitUrl:'https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789',links:[]},game:{displayPlayers:[]}});
function fixture(t,run){t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});const dir=mkdtempSync(path.join(os.tmpdir(),'obs-stop-integrity-')),bridge=new ObsStyleExport(dir),write=bridge.write.bind(bridge);try{bridge.setEnabled(true,state());run({bridge,write,read:name=>JSON.parse(readFileSync(path.join(bridge.directory,name),'utf8'))});}finally{bridge.write=write;bridge.close();rmSync(dir,{recursive:true,force:true});}}
for(const closing of [false,true])test(`ハートビート書込不可でも別ファイルで停止を伝える: ${closing?'終了':'一時停止'}`,t=>fixture(t,({bridge,write,read})=>{
 bridge.write=(name,data)=>{if(name==='streamkit-status.json')throw Error('locked');write(name,data);};
 if(closing)assert.equal(bridge.close(),true);else bridge.setEnabled(false,state());
 assert.equal(read('streamkit-stop.json').stop,true);assert.equal(read('streamkit-status.json').active,true);assert.equal(bridge.view().stopPending,false);assert.equal(bridge.enabled,false);
}));
test('別ファイルが書けない場合も通常の停止通知が届けば停止済みとして扱う',t=>fixture(t,({bridge,write,read})=>{
 bridge.write=(name,data)=>{if(name==='streamkit-stop.json')throw Error('locked');write(name,data);};bridge.setEnabled(false,state());assert.equal(read('streamkit-status.json').active,false);assert.equal(bridge.view().stopPending,false);
}));
test('両経路の停止失敗を再送し、書込先復旧後も配信は再開しない',t=>fixture(t,({bridge,write,read})=>{
 bridge.write=()=>{throw Error('locked');};bridge.setEnabled(false,state());assert.equal(bridge.view().stopPending,true);assert.equal(bridge.view().recovering,false);
 t.mock.timers.tick(2000);assert.equal(bridge.view().stopPending,true);bridge.write=write;t.mock.timers.tick(2000);
 assert.equal(bridge.view().stopPending,false);assert.equal(read('streamkit-status.json').active,false);assert.equal(read('streamkit-stop.json').stop,true);assert.equal(bridge.enabled,false);assert.equal(bridge.requested,false);assert.equal(bridge.view().error,'');
}));
test('停止再送待ちから明示再開した場合、古い停止タイマーと通知ファイルを残さない',t=>fixture(t,({bridge,write,read})=>{
 bridge.write=()=>{throw Error('locked');};bridge.setEnabled(false,state());bridge.write=write;bridge.setEnabled(true,state());t.mock.timers.tick(10000);
 assert.equal(bridge.enabled,true);assert.equal(bridge.stopTimer,null);assert.equal(read('streamkit-status.json').active,true);assert.equal(existsSync(path.join(bridge.directory,'streamkit-stop.json')),false);
}));
test('終了時も全書込不可なら成功を返さず、復旧後の最終試行で停止通知を残す',t=>fixture(t,({bridge,write,read})=>{
 bridge.write=()=>{throw Error('locked');};assert.equal(bridge.close(),false);assert.equal(bridge.view().stopPending,true);assert.equal(bridge.stopTimer,null);
 bridge.write=write;assert.equal(bridge.close(),true);assert.equal(read('streamkit-stop.json').stop,true);assert.equal(read('streamkit-status.json').active,false);
}));
for(const kind of ['broken-json','valid-json-wrong-css','revision-mismatch','oversized'])test(`表示ファイルの${kind}を検出し再生成する`,t=>fixture(t,({bridge,read})=>{
 const file=path.join(bridge.directory,'streamkit-style.json'),expected=readFileSync(file,'utf8');let corrupt;
 if(kind==='broken-json')corrupt='{broken';
 if(kind==='valid-json-wrong-css'){const d=JSON.parse(expected);d.css='body{display:none}';corrupt=JSON.stringify(d);}
 if(kind==='revision-mismatch'){const d=JSON.parse(expected);d.revision='other';corrupt=JSON.stringify(d);}
 if(kind==='oversized')corrupt='x'.repeat(8*1024*1024+1);
 writeFileSync(file,corrupt);t.mock.timers.tick(2000);assert.equal(bridge.enabled,false);assert.equal(bridge.view().recovering,true);
 t.mock.timers.tick(2000);assert.equal(bridge.enabled,true);assert.equal(bridge.view().error,'');assert.equal(readFileSync(file,'utf8'),expected);assert.equal(read('streamkit-style.json').revision,read('streamkit-status.json').revision);
}));
