import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {Store,cleanGame,cleanSettings} from '../lib/state.mjs';
import {colorIcon,templateIcon,statusBadgeSvg} from '../public/icons.js';

test('縦横と独立したアイコン倍率を保存し、旧設定へ既定値を補う',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'crew-display-'));try{
 const store=new Store(dir,{allowPlaintext:true});await store.load();await store.save({links:[],settings:{orientation:'vertical',size:110,characterScale:150,badgeSize:65,nameSize:28,showStatus:false,colorBackground:true,horizontalNamePosition:'overlap',verticalNamePosition:'right'}});
 const restored=new Store(dir,{allowPlaintext:true});await restored.load();assert.equal(restored.current.settings.orientation,'vertical');assert.equal(restored.current.settings.characterScale,150);assert.equal(restored.current.settings.badgeSize,65);assert.equal(restored.current.settings.showStatus,false);assert.equal(restored.current.settings.nameSize,28);assert.equal(cleanSettings({}).nameSize,12);
 assert.equal(restored.current.settings.colorBackground,true);assert.equal(restored.current.settings.horizontalNamePosition,'overlap');assert.equal(restored.current.settings.verticalNamePosition,'right');
 assert.equal(cleanSettings({}).colorBackground,false);assert.equal(cleanSettings({}).horizontalNamePosition,'below');assert.equal(cleanSettings({}).verticalNamePosition,'overlap');
 assert.equal(cleanSettings({size:80}).orientation,'horizontal');assert.equal(cleanSettings({}).showStatus,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('不正な並べ方やマーク倍率を拒否する',()=>{
 for(const settings of [{orientation:'url(evil)'},{badgeSize:Infinity},{badgeSize:81},{characterScale:49},{characterScale:'100'},{nameSize:7},{nameSize:41},{nameSize:NaN},{nameSize:'20'},{colorBackground:'red'},{horizontalNamePosition:'right'},{verticalNamePosition:'below'}])assert.throws(()=>cleanSettings(settings));
});
test('死亡と追放は同じDeadキャラクターで、Discordマークのみ異なる',()=>{
 const base={colorId:10,color:'#38FEDB',shadowColor:'#117F82',visorColor:'#95CADC'};
 assert.equal(colorIcon({...base,lifeState:'dead'}),colorIcon({...base,lifeState:'exiled'}));assert.notEqual(colorIcon({...base,lifeState:'alive'}),colorIcon({...base,lifeState:'dead'}));assert.equal(templateIcon({...base,lifeState:'exiled'}),'/icons/aucyandead.png');
 assert.match(statusBadgeSvg('dead'),/#ff244b/);assert.match(statusBadgeSvg('exiled'),/#f4b844/);assert.match(statusBadgeSvg('exiled'),/#fffaf4/);assert.equal(statusBadgeSvg('alive'),null);
});
test('生の生死・役職・死因は画面APIへ引き継がず、許可済みの状態だけ保持する',()=>{
 const game=cleanGame({players:[{key:'p',color:'#123456',lifeState:'exiled',isDead:true,role:'secret',killer:'secret'}]});assert.equal(game.players[0].lifeState,'exiled');
 for(const field of ['isDead','role','killer'])assert.equal(field in game.players[0],false);
 assert.equal(cleanGame({players:[{key:'p',color:'#123456',lifeState:'<script>'}]}).players[0].lifeState,'alive');
});
