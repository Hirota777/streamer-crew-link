import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createApp} from '../server.mjs';import {mkdtemp} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
test('更新通知の表示・スキップ・設定・旧応答・未保存時の更新停止',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-update-ui-')),port=37987,app=await createApp({directory,port,allowPlaintextSettings:true});await new Promise(r=>app.server.listen(port,'127.0.0.1',r));const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:780,height:930}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const current={revision:1,phase:'available',current:'1.0.1',installed:true,autoCheck:true,message:'新しいバージョンがあります。',release:{version:'1.0.2',size:100,notes:'<img src=x onerror=alert(1)>\n変更内容'}};window.updateActions=[];window.crewLink={copyOverlayUrl:async()=>{},onUpdate:fn=>window.emitUpdate=fn,update:async(action,value)=>{window.updateActions.push({action,value});if(action==='preference'){current.autoCheck=value;current.revision++;}return current;}};});
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('#update-download').waitFor({state:'visible'});
 assert.match(await page.locator('#update-version').textContent(),/1.0.1 → 1.0.2/);assert.equal(await page.locator('#update-notes img').count(),0);
 await page.locator('#update-skip').click();assert.equal(await page.evaluate(()=>window.updateActions.at(-1).action),'skip');
 await page.getByRole('tab',{name:'接続',exact:true}).click();await page.locator('.update-settings>summary').click();await page.locator('#update-auto').uncheck();assert.equal(await page.evaluate(()=>window.updateActions.at(-1).action),'preference');
 await page.evaluate(()=>window.emitUpdate({revision:3,phase:'ready',current:'1.0.1',installed:true,autoCheck:false,message:'完了',release:{version:'1.0.2',size:100}}));
 await page.evaluate(()=>window.emitUpdate({revision:2,phase:'available',current:'1.0.1',installed:true,autoCheck:true,release:{version:'1.0.0',size:100}}));assert.equal(await page.locator('#update-install').isVisible(),true);assert.match(await page.locator('#update-version').textContent(),/1.0.2/);
 await page.getByRole('tab',{name:'配信画面',exact:true}).click();await page.locator('.display-options>summary').click();await page.locator('#nameSize').fill('24');await page.locator('#nameSize').dispatchEvent('input');await page.locator('#update-install').click();assert.match(await page.locator('#update-message').textContent(),/未保存/);assert.equal(await page.evaluate(()=>window.updateActions.some(a=>a.action==='install')),false);
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-label').textContent==='保存済み');await page.locator('#update-install').click();assert.equal(await page.evaluate(()=>window.updateActions.some(a=>a.action==='install')),true);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();app.shutdown();}
});
