import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
let port=37980;
async function fixture(run){const dir=await mkdtemp(path.join(os.tmpdir(),'crew-split-ui-')),listenPort=port++,app=await createApp({port:listenPort,directory:dir,allowPlaintextSettings:true});let browser;
 try{
  await app.store.save({links:[{gameKey:'a',gameName:'A',discordId:'u-a',label:'original'}],settings:{displaySource:'discord',size:80}});
  await app.store.create('縦配信',undefined,'display',{settings:{displaySource:'discord',size:120,orientation:'vertical'}});const displayB=app.store.display.id;await app.store.select('default','display');
  app.ingestGame({scene:'Lobby',players:[{key:'a',name:'A',color:'#c51111'}]});await new Promise(r=>app.server.listen(listenPort,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:780,height:930}});await page.goto('http://127.0.0.1:'+listenPort);await page.locator('#display-presets option').nth(1).waitFor({state:'attached'});
  await run({page,app,displayB});
 }finally{await browser?.close();app.shutdown();await rm(dir,{recursive:true,force:true});}
}
test('片方の未保存編集を保ったまま、もう片方だけを切り替え・保存できる',()=>fixture(async({page,app,displayB})=>{
 await page.getByRole('tab',{name:'メンバー',exact:true}).click();await page.getByLabel('Aの配信用の名前',{exact:true}).fill('unsaved member');
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#display-presets').selectOption(displayB);await page.waitForFunction(()=>document.querySelector('#size').value==='120');
 assert.equal(await page.getByLabel('Aの配信用の名前',{exact:true}).inputValue(),'unsaved member');assert.equal(app.store.current.id,'default');
 await page.waitForFunction(()=>document.querySelector('#member-save-state').textContent==='自動保存済み');assert.equal(app.store.current.links[0].label,'unsaved member');assert.equal(app.store.display.id,displayB);
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('.display-options>summary').click();await page.locator('#size').fill('140');await page.locator('#size').dispatchEvent('input');
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#save-display').click();await page.waitForFunction(()=>document.querySelector('#save-label').textContent==='保存済み');assert.equal(app.store.current.links[0].label,'unsaved member');assert.equal(app.store.display.settings.size,140);
 await page.screenshot({path:path.resolve('../../../outputs/プリセット分離-確認画面.png')});
}));
test('別名保存は対象の編集だけを新規保存し、元の配信画面を上書きしない',()=>fixture(async({page,app})=>{
 await page.locator('.display-options>summary').click();await page.locator('#size').fill('150');await page.locator('#size').dispatchEvent('input');
 await page.locator('#display-preset-create>summary').click();await page.locator('#display-preset-name').fill('大きい表示');await page.locator('#create-display-preset').click();
 await page.waitForFunction(()=>document.querySelector('#display-presets').selectedOptions[0]?.textContent==='大きい表示');
 assert.equal(app.store.data.displayPresets[0].settings.size,80);assert.equal(app.store.current.settings.size,150);assert.equal(app.store.current.id,'default');assert.equal(app.store.current.links[0].label,'original');
 await page.reload();await page.locator('#display-presets option').nth(2).waitFor({state:'attached'});assert.equal(await page.locator('#size').inputValue(),'150');
}));
test('デモ中は配信画面だけを別名保存し、実際のメンバーを保持する',()=>fixture(async({page,app})=>{
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#demo').textContent==='実際の接続に戻る');
 assert.equal(await page.locator('#create-preset').count(),0);
 await page.locator('.display-options>summary').click();await page.locator('#size').fill('110');await page.locator('#size').dispatchEvent('input');
 await page.locator('#display-preset-create>summary').click();await page.locator('#display-preset-name').fill('デモで調整');await page.locator('#create-display-preset').click();
 await page.waitForFunction(()=>document.querySelector('#display-presets').selectedOptions[0]?.textContent==='デモで調整');assert.equal(app.store.current.links.length,1);assert.equal(app.store.current.links[0].gameKey,'a');assert.equal(app.store.data.presets.length,1);assert.equal(app.store.current.settings.size,110);
}));
test('両方を編集中でも種類別の保存はもう片方の変更を確定しない',()=>fixture(async({page,app})=>{
 await page.getByRole('tab',{name:'メンバー',exact:true}).click();await page.getByLabel('Aの配信用の名前',{exact:true}).fill('member edit');
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('.display-options>summary').click();await page.locator('#size').fill('130');await page.locator('#size').dispatchEvent('input');
 await page.waitForFunction(()=>document.querySelector('#member-save-state').textContent==='自動保存済み');
 assert.equal(app.store.current.links[0].label,'member edit');assert.equal(app.store.current.settings.size,80);assert.equal(await page.locator('#size').inputValue(),'130');assert.equal(await page.locator('#save-label').innerText(),'未保存の変更があります');
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('#save-display').click();await page.waitForFunction(()=>document.querySelector('#save-label').textContent==='保存済み');assert.equal(app.store.current.settings.size,130);assert.equal(app.store.current.links[0].label,'member edit');
}));
