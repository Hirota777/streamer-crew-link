import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {Store,cleanSettings} from '../lib/state.mjs';
async function temporary(run){const dir=await mkdtemp(path.join(os.tmpdir(),'crew-limits-'));try{const store=new Store(dir,{allowPlaintext:true});await store.load();await run(store,dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('表示設定の全数値の上下限を受理し、範囲外・型違いを拒否する',()=>{
 for(const [key,min,max] of [['size',40,160],['gap',0,60],['characterScale',50,160],['badgeSize',20,80],['nameSize',8,40]]){
  for(const value of [min,max])assert.equal(cleanSettings({[key]:value})[key],value);
  for(const value of [min-1,max+1,NaN,Infinity,-Infinity,String(min),null])assert.throws(()=>cleanSettings({[key]:value}),key+': '+String(value));
 }
});
test('対応づけ50件を保存・復元し、51件目の拒否で既存データを壊さない',()=>temporary(async(store,dir)=>{
 const links=Array.from({length:50},(_,i)=>({gameKey:'p'+i,discordId:'u'+i,label:'参加者'+i}));await store.save({links,settings:{size:160}});await assert.rejects(store.save({links:[...links,{gameKey:'extra',discordId:'extra'}],settings:{size:40}}));assert.equal(store.current.links.length,50);assert.equal(store.current.settings.size,160);const restored=new Store(dir,{allowPlaintext:true});await restored.load();assert.deepEqual(restored.data,store.data);
}));
test('プリセット30件の上限で作成を拒否し、選択中データと再読込を維持する',()=>temporary(async(store,dir)=>{
 for(let i=1;i<30;i++)await store.create('preset-'+i);const before=structuredClone(store.data);await assert.rejects(store.create('overflow'));assert.deepEqual(store.data,before);const restored=new Store(dir,{allowPlaintext:true});await restored.load();assert.deepEqual(restored.data,before);
}));
test('保存失敗ではメモリーを確定せず、待機中の次の保存は成功できる',()=>temporary(async(store,dir)=>{
 await store.save({links:[],settings:{size:80}});const write=store.storage.write.bind(store.storage);let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let first=true;store.storage.write=async data=>{if(first){first=false;entered();await gate;throw Error('Synthetic write failure');}return write(data)};
 const failed=store.save({links:[],settings:{size:100}});const rejected=assert.rejects(failed,/Synthetic/);await started;assert.equal(store.current.settings.size,80);const next=store.save({links:[],settings:{size:120}});release();await rejected;await next;assert.equal(store.current.settings.size,120);const restored=new Store(dir,{allowPlaintext:true});await restored.load();assert.equal(restored.current.settings.size,120);
}));
