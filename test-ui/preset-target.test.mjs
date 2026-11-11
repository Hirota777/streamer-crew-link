import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let port=37965;
async function fixture(run){
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-bugs0914-')),listenPort=port++,app=await createApp({port:listenPort,directory:dir,allowPlaintextSettings:true});
 const links=[{gameKey:'a',gameName:'A',discordId:'u-a',label:'original'}];
 await app.store.save({links,settings:{size:80}});await app.store.create('B');const b=app.store.current.id;await app.store.save({links,settings:{size:100}});await app.store.select('default');
 app.ingestGame({scene:'Lobby',players:[{key:'a',name:'A',color:'#c51111'}]});await new Promise(r=>app.server.listen(listenPort,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const base='http://127.0.0.1:'+listenPort,page=await browser.newPage({viewport:{width:780,height:930}});await page.goto(base);await page.locator('#presets option').nth(1).waitFor({state:'attached'});
  const bootstrap=await(await fetch(base+'/api/bootstrap')).json();
  const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':bootstrap.token},body:JSON.stringify(body)});assert.equal(r.status,200);return r.json()};
  await run({app,page,post,b,links});
 }finally{await browser.close();app.shutdown();await rm(dir,{recursive:true,force:true});}
}
test('保存要求が遅れても、別画面で選択したプリセットを上書きしない',()=>fixture(async({app,page,post,b})=>{
 await page.locator('.display-options>summary').click();await page.locator('#size').fill('120');await page.locator('#size').dispatchEvent('input');
 let release,signal;const gate=new Promise(r=>release=r),started=new Promise(r=>signal=r);
 await page.route('**/api/save',async route=>{signal();await gate;await route.continue()});
 try{
  await page.locator('#save').click();await started;await post('/api/presets/select',{id:b});await page.waitForFunction(id=>document.querySelector('#presets').value===id,b);
  release();await page.waitForFunction(()=>document.querySelector('#save-label').textContent==='保存済み');
  const original=app.store.data.presets.find(p=>p.id==='default'),other=app.store.data.presets.find(p=>p.id===b);
  console.log(JSON.stringify({case:'save-target',original:original.settings.size,other:other.settings.size}));
  assert.equal(other.settings.size,100,'Aの保存要求がBの設定を上書きした');assert.equal(original.settings.size,120);
 }finally{release();}
}));
test('別画面で対応づけを保存すると、メンバー表の名前欄も更新する',()=>fixture(async({page,post,links})=>{
 await page.getByRole('tab',{name:'メンバー',exact:true}).click();const label=page.getByLabel('Aの配信用の名前',{exact:true});assert.equal(await label.inputValue(),'original');
 await post('/api/save',{links:[{...links[0],label:'changed elsewhere'}],settings:{size:120}});
 await page.waitForFunction(()=>document.querySelector('#size').value==='120');
 console.log(JSON.stringify({case:'mapping-refresh',table:await label.inputValue(),expected:'changed elsewhere'}));
 assert.equal(await label.inputValue(),'changed elsewhere','未編集なのに対応づけ表だけ古い名前が残った');
}));
