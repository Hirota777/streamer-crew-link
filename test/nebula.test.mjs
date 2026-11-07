import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanGame} from '../lib/state.mjs';
import {spritePalette,colorIcon,templateIcon} from '../public/icons.js';
test('Nebulaは色IDではなく取得RGBで元画像を着色する',()=>{
 const p=cleanGame({players:[{key:'a',colorId:0,colorSource:'nebula',color:'#123456',shadowColor:'#654321',visorColor:'#abcdef',colorKnown:true}]}).players[0];
 assert.equal(colorIcon(p),null);assert.equal(templateIcon(p),'/icons/aucyan.png');assert.deepEqual([spritePalette(p).body,spritePalette(p).shadow,spritePalette(p).visor],['#123456','#654321','#abcdef']);
});
test('Nebulaの色を取得できない場合は標準色の画像に置換しない',()=>{
 const p=cleanGame({players:[{key:'a',colorId:0,colorSource:'nebula',color:'#8794a3',colorKnown:true}]}).players[0];assert.equal(p.colorKnown,false);assert.equal(colorIcon(p),null);
});
test('不正な補助色を画素変換へ渡さない',()=>{const p=spritePalette({color:'#123456',shadowColor:'" onload="evil',visorColor:'#abcdef'});assert.equal(JSON.stringify(p).includes('onload'),false);assert.equal(spritePalette({color:'<script>'}),null);});
