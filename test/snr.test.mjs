import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanGame} from '../lib/state.mjs';
import {spritePalette,colorIcon,templateIcon} from '../public/icons.js';
test('SNR追加色を元の絵柄へ反映し、死亡と追放はDead素材を使う',()=>{
 const p=cleanGame({players:[{key:'snr',lifeState:'exiled',colorSource:'snr',colorId:81,color:'#6D071A',shadowColor:'#36020B',visorColor:'#95C9DB'}]}).players[0];assert.equal(colorIcon(p),null);assert.equal(spritePalette(p).body,'#6D071A');assert.equal(spritePalette(p).shadow,'#36020B');assert.equal(templateIcon(p),'/icons/aucyandead.png');
});
test('SNRの標準18色は生存・Deadの指定PNGを使用する',()=>{
 const p=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:0,color:'#c51111'}]}).players[0];assert.equal(colorIcon(p),'/icons/aured.png');assert.equal(colorIcon({...p,lifeState:'dead'}),'/icons/aureddead.png');assert.equal(colorIcon({...p,lifeState:'exiled'}),'/icons/aureddead.png');
 const missing=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:18,color:'#8794a3'}]}).players[0];assert.equal(missing.colorKnown,false);assert.equal(colorIcon(missing),null);
});
test('SNRの色フィールドに混入したタグや属性を使用しない',()=>{const p=spritePalette({color:'#123456',shadowColor:'" onload="alert(1)',visorColor:'<script>'});assert.equal(JSON.stringify(p).includes('onload'),false);assert.equal(JSON.stringify(p).includes('<script>'),false);});
