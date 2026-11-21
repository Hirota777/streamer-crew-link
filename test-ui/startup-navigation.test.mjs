import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server.mjs';

test('画面処理の読み込みが遅くても、準備前のタブ操作を失わない',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crew-startup-nav-')),port=38579;
 const app=await createApp({directory,port,allowPlaintextSettings:true});let browser,release;
 try{
  await new Promise(r=>app.server.listen(port,'127.0.0.1',r));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();
  const gate=new Promise(r=>release=r);let requested;
  const request=new Promise(r=>requested=r);
  await page.route('**/app.js',async route=>{requested();await gate;await route.continue();});
  await page.goto(`http://127.0.0.1:${port}`,{waitUntil:'commit'});await request;
  const tab=page.getByRole('tab',{name:'初期設定',exact:true});await tab.waitFor({state:'visible'});
  assert.equal(await tab.isDisabled(),true,'準備前に押せると操作が無視される');
  const click=tab.click();release();await click;
  await page.locator('#connections').waitFor({state:'visible'});
  assert.equal(await tab.getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#displaySource').inputValue(),'streamkit');
  assert.equal(app.obsExport.enabled,false,'URL未設定では自動開始しない');
 }finally{release?.();await browser?.close();app.shutdown();await rm(directory,{recursive:true,force:true});}
});
