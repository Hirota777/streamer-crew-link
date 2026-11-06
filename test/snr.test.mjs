import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanGame} from '../lib/state.mjs';
import {nebulaSvg,colorIcon} from '../public/icons.js';

test('SNR追加色の本体と影を保持し、追加色のキャラクターを描画する',()=>{
 const player=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:81,color:'#6D071A',shadowColor:'#36020B',visorColor:'#95C9DB'}]}).players[0];
 assert.equal(player.colorSource,'snr');assert.equal(player.colorKnown,true);
 const svg=nebulaSvg(player);assert.ok(svg.includes('#6D071A'));assert.ok(svg.includes('#36020B'));assert.equal(colorIcon(player),null);
});
test('SNRの通常18色は指定のPNGを使用し、不明な追加色を標準色に置き換えない',()=>{
 const standard=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:0,color:'#c51111'}]}).players[0];
 assert.equal(standard.colorKnown,true);assert.equal(colorIcon(standard),'/icons/aured.png');assert.equal(nebulaSvg(standard),null);
 const missing=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:18,color:'#8794a3'}]}).players[0];
 assert.equal(missing.colorKnown,false);assert.equal(colorIcon(missing),null);assert.equal(nebulaSvg(missing),null);
});
test('SNRの色フィールドに混入したタグや属性をSVGへ挿入しない',()=>{
 const player=cleanGame({players:[{key:'snr',colorSource:'snr',colorId:18,color:'#123456',shadowColor:'" onload="alert(1)',visorColor:'#abcdef'}]}).players[0];
 assert.equal(player.colorKnown,false);assert.equal(nebulaSvg(player),null);
 assert.equal(nebulaSvg({...player,colorKnown:true,shadowColor:'<script>'}),null);
});
