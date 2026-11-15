import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../lib/state.mjs';
import {createApp} from '../server.mjs';

test('見た目の保存先を固定し、共通の対応づけを維持する',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-target-'));try{
 const store=new Store(dir,{allowPlaintext:true});await store.load();await store.save({links:[{gameKey:'a',discordId:'a'}],settings:{size:80}});
 await store.create('Display B',undefined,'display');const b=store.display.id;await store.save({settings:{size:100}});
 await store.save({presetId:'default',displayPresetId:'default',settings:{size:120}},{settingsOnly:true});assert.equal(store.display.id,b);assert.equal(store.current.settings.size,100);assert.equal(store.data.displayPresets[0].settings.size,120);assert.equal(store.current.links[0].gameKey,'a');
 const before=structuredClone(store.data);await assert.rejects(store.save({presetId:'missing',links:[],settings:{}}));assert.deepEqual(store.data,before);await assert.rejects(store.create('members',undefined,'members'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('待機中の旧形式保存も、後続のプリセット選択で保存先が変わらない',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-target-queue-'));
 try{
  const store=new Store(dir,{allowPlaintext:true});await store.load();await store.create('B',undefined,'display');const b=store.display.id;await store.select('default','display');
  let release;store.queue=new Promise(r=>release=r);
  const selected=store.select(b,'display'),saved=store.save({settings:{size:120}});release();await selected;await saved;
  assert.equal(store.display.id,b);assert.equal(store.current.settings.size,80);assert.equal(store.data.displayPresets[0].settings.size,120);

 }finally{await rm(dir,{recursive:true,force:true});}
});

test('同じサーバーの状態番号は増加し、再起動は別の識別子になる',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-version-'));let app;
 try{
  app=await createApp({directory:dir,allowPlaintextSettings:true});const first=app.snapshot(),second=app.snapshot();assert.equal(first.instanceId,second.instanceId);assert.ok(second.stateVersion>first.stateVersion);app.shutdown();
  app=await createApp({directory:dir,allowPlaintextSettings:true});assert.notEqual(app.snapshot().instanceId,first.instanceId);
 }finally{app?.shutdown();await rm(dir,{recursive:true,force:true});}
});
