import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createApp} from '../server.mjs';
const url='https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789?hide_names=false&text_color=%23ffffff';
let port=38011;
async function fixture(run){const directory=await mkdtemp(path.join(os.tmpdir(),'crew-streamkit-ui-')),listenPort=port++,base='http://127.0.0.1:'+listenPort,app=await createApp({directory,port:listenPort,allowPlaintextSettings:true});let browser;
 try{
  await app.store.save({settings:{displaySource:'streamkit'}});await app.store.create('別の見た目',undefined,'display');const b=app.store.display.id;await app.store.select('default','display');
  await new Promise(r=>app.server.listen(listenPort,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:780,height:930}}),errors=[],external=[];
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(!req.url().startsWith(base+'/'))external.push(req.url());});
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedStreamkitUrl=value;}}});});
  await page.goto(base);await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.locator('#display-presets option').nth(1).waitFor({state:'attached'});
  const bootstrap=await(await fetch(base+'/api/bootstrap')).json();const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':bootstrap.token},body:JSON.stringify(body)});assert.equal(response.status,200);return response.json();};
  await run({app,page,b,post});assert.deepEqual(errors,[]);assert.deepEqual(external,[],'URL入力・保存だけでは外部ページを読み込まない');
 }finally{await browser?.close();app.shutdown();await rm(directory,{recursive:true,force:true});}
}
async function fillUrl(page,value){if(!await page.locator('#streamkit-name').inputValue())await page.locator('#streamkit-name').fill('テストの通話');await page.locator('#streamkit-url').fill(value);}
async function save(page){await page.locator('#save-streamkit').click();await page.waitForFunction(()=>document.querySelector('#streamkit-state').textContent.startsWith('URL保存済み'));}
test('Voice URLを共通保存・再読込・コピーし、見た目を切り替えても解除を維持する',()=>fixture(async({app,page,b})=>{
 await fillUrl(page,url);assert.equal(app.store.current.streamkitUrl,'');assert.equal(await page.locator('#copy-streamkit').isDisabled(),true);await save(page);assert.equal(app.store.current.streamkitUrl,url);
 await page.locator('#copy-streamkit').click();assert.equal(await page.evaluate(()=>window.copiedStreamkitUrl),url);
 await page.reload();await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.waitForFunction(u=>document.querySelector('#streamkit-url').value===u,url);
 await page.screenshot({path:path.resolve('../../../outputs/Streamkit-URL保存-確認.png')});
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#display-presets').selectOption(b);await page.waitForFunction(id=>document.querySelector('#display-presets').value===id,b);assert.equal(app.store.current.streamkitUrl,url);
 await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.locator('#clear-streamkit').click();await page.waitForFunction(()=>document.querySelector('#streamkit-state').textContent==='未設定');await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#display-presets').selectOption('default');await page.waitForFunction(()=>document.querySelector('#display-presets').value==='default');assert.equal(app.store.current.streamkitUrl,'');

}));
test('不正URLを拒否し、表示先の保存で見た目の未保存変更を確定しない',()=>fixture(async({app,page})=>{
 await fillUrl(page,'https://example.com/overlay/voice/123456789012345678/234567890123456789');assert.equal(await page.locator('#save-streamkit').isDisabled(),false);
 await page.locator('#save-streamkit').click();assert.equal(app.store.current.streamkitUrl,'');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('公式Streamkit'));assert.match(await page.locator('#toast').innerText(),/公式Streamkit/);
 await fillUrl(page,url);await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('.display-options>summary').click();await page.locator('#size').fill('130');await page.locator('#size').dispatchEvent('input');
 await page.getByRole('tab',{name:'初期設定',exact:true}).click();await save(page);assert.equal(app.store.current.settings.size,80);assert.equal(app.store.current.streamkitUrl,url);assert.equal(await page.locator('#save-label').innerText(),'未保存の変更があります');
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#save-display').click();await page.waitForFunction(()=>document.querySelector('#save-label').textContent==='保存済み');assert.equal(app.store.current.settings.size,130);assert.equal(app.store.current.streamkitUrl,url);
}));
test('別画面で見た目を切り替えても未保存URLを維持する',()=>fixture(async({app,page,b,post})=>{
 await fillUrl(page,url);await post('/api/display-presets/select',{id:b});await page.waitForFunction(id=>document.querySelector('#display-presets').value===id,b);assert.equal(await page.locator('#streamkit-url').inputValue(),url);assert.equal(app.store.current.streamkitUrl,'');await save(page);assert.equal(app.store.current.streamkitUrl,url);
}));

test('デモ中と終了後のURL保存でも、実際の対応づけを変更しない',()=>fixture(async({app,page})=>{
 await app.store.save({links:[{gameKey:'real',discordId:'real-user'}]});await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#demo').textContent==='実際の接続に戻る');
 await fillUrl(page,url);await save(page);assert.equal(app.store.current.links[0].gameKey,'real');
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#demo').textContent==='デモを試す');
 await fillUrl(page,url+'&limit_speaking=false');await save(page);assert.equal(app.store.current.streamkitUrl,url+'&limit_speaking=false');assert.equal(app.store.current.links[0].gameKey,'real');assert.equal(await page.locator('#create-preset').count(),0);

}));

test('Discord IDを登録・保存してOBS連携を開始し、解除保存で重ね合わせから削除する',()=>fixture(async({app,page})=>{
 app.ingestGame({scene:'Lobby',lifeTracking:true,players:[{key:'a',name:'テスト参加者',color:'#ca243e',colorId:0,lifeState:'alive'}]});
 await fillUrl(page,url);await save(page);
 await page.getByRole('tab',{name:'メンバー',exact:true}).click();
 const id=page.getByRole('textbox',{name:'テスト参加者のDiscord参加者',exact:true});await id.fill('not-an-id');await id.press('Tab');assert.equal(await id.inputValue(),'');
 await id.fill('345678901234567890');await id.press('Tab');await page.waitForFunction(()=>document.querySelector('#member-save-state').textContent==='自動保存済み');assert.equal(app.store.current.links[0].discordId,'345678901234567890');
 await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#obs-toggle').textContent==='連携を一時停止');assert.equal(await page.locator('.header-actions #obs-toggle').count(),0);assert.equal(await page.locator('#autoStartObs').isChecked(),true);for(let attempt=0;attempt<120&&app.obsExport.view().mapped!==1;attempt++)await new Promise(r=>setTimeout(r,25));assert.equal(app.obsExport.view().mapped,1);
 await page.screenshot({path:path.resolve('../../../outputs/Streamkit-0.2.0-連携設定.png')});
 await page.getByRole('tab',{name:'メンバー',exact:true}).click();await page.getByRole('button',{name:'テスト参加者の対応づけを解除',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#member-save-state').textContent==='自動保存済み');
 for(let attempt=0;attempt<120&&app.obsExport.view().mapped!==0;attempt++)await new Promise(r=>setTimeout(r,25));assert.equal(app.obsExport.view().mapped,0);assert.equal(app.store.current.links.length,0);
 await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.locator('#obs-toggle').click();assert.equal(app.obsExport.view().enabled,false);
}));
