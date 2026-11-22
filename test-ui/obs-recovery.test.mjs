import {test} from 'node:test';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createApp} from '../server.mjs';
test('復旧待ちの表示と停止ボタン、成功時の通常表示への復帰',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'obs-recovery-ui-')),port=38588,app=await createApp({directory,port,allowPlaintextSettings:true});let browser;
 try{
  await app.store.save({streamkitUrl:'https://streamkit.discord.com/overlay/voice/123456789012345678/234567890123456789'});app.obsExport.setEnabled(true,app.snapshot());
  await new Promise(r=>app.server.listen(port,'127.0.0.1',r));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+port);await page.getByRole('tab',{name:'初期設定',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#obs-status').textContent==='連携ファイル更新中');
  app.obsExport.retryDelays=[5000];const write=app.obsExport.write.bind(app.obsExport);app.obsExport.write=()=>{throw Error('sharing violation');};app.obsExport.status();
  await page.waitForFunction(()=>document.querySelector('#obs-status').textContent==='復旧を試みています');assert.equal(await page.locator('#obs-toggle').innerText(),'連携を一時停止');await page.locator('#obs-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#obs-toggle').textContent==='連携を再開');assert.equal(app.obsExport.requested,false);assert.equal(app.obsExport.view().nextRetryAt,null);
  app.obsExport.write=write;await page.locator('#obs-toggle').click();await page.waitForFunction(()=>document.querySelector('#obs-status').textContent==='連携ファイル更新中');
  app.obsExport.retryDelays=[200];app.obsExport.write=()=>{throw Error('sharing violation');};app.obsExport.status();app.obsExport.write=write;
  await page.waitForFunction(()=>document.querySelector('#obs-status').textContent==='連携ファイル更新中'&&document.querySelector('#obs-sync-state').textContent.startsWith('連携ファイル更新中'));
  for(let i=0;i<50&&!app.obsExport.enabled;i++)await new Promise(r=>setTimeout(r,10));assert.equal(app.obsExport.enabled,true);assert.equal(app.obsExport.view().error,'');assert.deepEqual(errors,[]);
 }finally{await browser?.close();app.shutdown();await rm(directory,{recursive:true,force:true});}
});
