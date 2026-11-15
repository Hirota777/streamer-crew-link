import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';import path from 'node:path';import os from 'node:os';
import {avatarSelector,createObsStyle,ObsStyleExport} from '../lib/obs-style.mjs';import {defaults} from '../lib/state.mjs';
const id='345678901234567890',url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789';
const player={key:'a',name:'A',color:'#ca243e',colorId:0,colorKnown:true,lifeState:'alive'};
const state=(settings={},players=[player],links=[{gameKey:'a',discordId:id,visible:true}])=>({preset:{streamkitUrl:url,settings:{...defaults,displaySource:'streamkit',...settings},links},game:{displayPlayers:players}});
test('重ね合わせはユーザーIDを含む画像だけに一致し、順番・共通アバターには依存しない',()=>{
 const selector=avatarSelector(id);assert.match(selector,/\/avatars\/345678901234567890\//);assert.match(selector,/\/users\/345678901234567890\/avatars\//);assert.doesNotMatch(selector,/nth-child|embed\/avatars/);assert.throws(()=>avatarSelector('x"]{}'));
 const value=createObsStyle(state());assert.equal(value.mapped,1);assert.equal(value.present,1);assert.match(value.css,/data:image\/png;base64/);assert.doesNotMatch(value.css,/http:\/\/127|cdn.discord/);
});
test('生存から死亡・追放へ切り替わり、クルー非表示でも同じ赤い×を表示する',()=>{
 const dead=createObsStyle(state({},[{...player,lifeState:'dead'}]));const exiled=createObsStyle(state({},[{...player,lifeState:'exiled'}]));assert.equal(dead.css,exiled.css);assert.match(dead.css,/data:image\/svg\+xml/);
 const hidden=createObsStyle(state({showCharacter:false},[{...player,lifeState:'dead'}]));assert.doesNotMatch(hidden.css,/data:image\/png/);assert.match(hidden.css,/data:image\/svg/);
 assert.doesNotMatch(createObsStyle(state({showStatus:false},[{...player,lifeState:'dead'}])).css,/data:image\/svg/);
});
test('未確定の色や不在プレイヤーに古いクルーを生成せず、非表示と名前の安全な文字列化を適用する',()=>{
 assert.doesNotMatch(createObsStyle(state({},[{...player,colorKnown:false}])).css,/data:image\/png/);
 assert.equal(createObsStyle(state({},[])).present,0);
 const unsafe=createObsStyle(state({},[player],[{gameKey:'a',discordId:id,label:'";}body{display:none}',visible:false}]));assert.match(unsafe.css,/display:none!important/);assert.doesNotMatch(unsafe.css,/body\{display:none/);
 const label=createObsStyle(state({},[player],[{gameKey:'a',discordId:id,label:'";}body{display:none}'}]));assert.doesNotMatch(label.css,/body\{display:none/);assert.match(label.css,/\\22 /);
});
test('縦横・名前位置・発言アニメーション・動的色用画像生成を反映する',()=>{
 const vertical=createObsStyle(state({orientation:'vertical',verticalNamePosition:'right',bounceSpeaking:true,colorBackground:true}));assert.match(vertical.css,/grid-auto-flow:column/);assert.match(vertical.css,/margin-left:161.6px/);assert.match(vertical.css,/scl-bounce/);assert.match(vertical.css,/background:#ca243e/);
 let received;const dynamic={...player,colorSource:'nebula',colorId:99};const result=createObsStyle(state({},[dynamic]),{spriteEncoder:p=>{received=p;return 'data:image/png;base64,fixture';}});assert.equal(received,dynamic);assert.match(result.css,/base64,fixture/);
 assert.equal(createObsStyle(state({},[player],[{gameKey:'a',discordId:'bad'}])).skipped,1);
});
test('OBSファイルは保存済み状態から生成し、変更時に更新、停止時にactiveを解除する',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'crew-obs-'));const bridge=new ObsStyleExport(dir,{now:()=>1234567});
 try{assert.throws(()=>bridge.setEnabled(true,stateWithNoUrl()));bridge.setEnabled(true,state());const folder=bridge.directory;assert.equal(JSON.parse(readFileSync(path.join(folder,'streamkit-status.json'))).active,true);assert.match(readFileSync(path.join(folder,'streamer-crew-link.lua'),'utf8'),/script_load/);
 const first=JSON.parse(readFileSync(path.join(folder,'streamkit-style.json')));bridge.flush(state());assert.equal(bridge.revision,first.revision);
 bridge.flush(state({},[{...player,lifeState:'dead'}]));assert.notEqual(bridge.revision,first.revision);bridge.close();assert.equal(JSON.parse(readFileSync(path.join(folder,'streamkit-status.json'))).active,false);
 bridge.setEnabled(true,state());bridge.flush(stateWithNoUrl());assert.equal(bridge.enabled,false);
 }finally{bridge.close();rmSync(dir,{recursive:true,force:true});}
 function stateWithNoUrl(){const value=state();value.preset.streamkitUrl='';return value;}
});
test('書込不可の保存先では有効状態を残さない',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'crew-obs-fail-'));writeFileSync(path.join(dir,'obs-streamkit'),'file');const bridge=new ObsStyleExport(dir);
 try{assert.throws(()=>bridge.setEnabled(true,state()));assert.equal(bridge.view().enabled,false);}finally{bridge.close();rmSync(dir,{recursive:true,force:true});}
});
test('停止直前の更新予約が残っていても、連携ファイルを再作成しない',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'crew-obs-stop-')),bridge=new ObsStyleExport(dir);
 try{bridge.setEnabled(true,state());bridge.update(state({},[{...player,lifeState:'dead'}]));bridge.setEnabled(false,state());await new Promise(r=>setTimeout(r,350));assert.equal(bridge.view().enabled,false);assert.throws(()=>readFileSync(path.join(bridge.directory,'streamkit-style.json')));assert.equal(JSON.parse(readFileSync(path.join(bridge.directory,'streamkit-status.json'))).active,false);}finally{bridge.close();rmSync(dir,{recursive:true,force:true});}
});
