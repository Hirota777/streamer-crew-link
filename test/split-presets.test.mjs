import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../lib/state.mjs';
async function fixture(run){const dir=await mkdtemp(path.join(os.tmpdir(),'crew-split-'));try{const store=new Store(dir,{allowPlaintext:true});await store.load();await run(store,dir);}finally{await rm(dir,{recursive:true,force:true});}}
const links=[{gameKey:'a',discordId:'u',label:'A'}];
test('対応づけは共通の1件とし、見た目だけを切り替えて再起動後も保持する',()=>fixture(async(s,dir)=>{
 await s.save({links,settings:{size:90}});await assert.rejects(s.create('メンバーB',undefined,'members',{links:[]}));
 await s.create('縦配信',undefined,'display',{settings:{size:120,orientation:'vertical'}});const displayB=s.display.id;assert.equal(s.current.links.length,1);await s.select('default','display');assert.equal(s.current.settings.size,90);await s.select(displayB,'display');
 const restored=new Store(dir,{allowPlaintext:true});await restored.load();assert.equal(restored.display.id,displayB);assert.equal(restored.current.links.length,1);assert.equal(restored.data.presets.length,1);assert.equal('links' in restored.data.displayPresets[0],false);
}));

test('別名保存は元を変更せず、デモの配信画面保存も対応づけを変えない',()=>fixture(async s=>{
 await s.save({links,settings:{size:80}});await s.create('別の画面','default','display',{settings:{size:140}});
 assert.equal(s.data.displayPresets[0].settings.size,80);assert.equal(s.display.settings.size,140);assert.equal(s.current.links.length,1);
 await s.save({presetId:'default',displayPresetId:s.display.id,links:[],settings:{size:110}},{settingsOnly:true});assert.equal(s.current.links.length,1);
 await assert.rejects(s.create('別メンバー','default','members',{links:[]}));assert.equal(s.data.presets[0].links.length,1);assert.equal(s.current.settings.size,110);
}));
test('旧形式は引き継がず、2種類の初期プリセットへ切り替える',()=>fixture(async(s,dir)=>{
 await writeFile(path.join(dir,'settings.json'),JSON.stringify({schema:1,active:'old',presets:[{id:'old',name:'旧プリセット',links,settings:{size:150}}]}));
 await s.load();assert.equal(s.data.schema,2);assert.deepEqual(s.current.links,[]);assert.equal(s.current.settings.size,80);assert.equal(s.data.presets.length,1);assert.equal(s.data.displayPresets.length,1);
 assert.equal(JSON.parse(await readFile(path.join(dir,'settings.json'),'utf8')).schema,2);
}));
test('配信画面の保存先が無効ならメンバー変更も確定せず、別名保存の失敗も元を変えない',()=>fixture(async s=>{
 await s.save({links,settings:{size:80}});const before=structuredClone(s.data);
 await assert.rejects(s.save({links:[],settings:{size:120},displayPresetId:'missing'}));assert.deepEqual(s.data,before);
 await assert.rejects(s.create('invalid','default','display',{settings:{size:999}}));assert.deepEqual(s.data,before);
}));
