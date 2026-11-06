import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cleanGame} from '../lib/state.mjs';
import {nebulaSvg} from '../public/icons.js';
test('同じ色IDでもNebulaの実RGB・影・バイザーを優先する',()=>{
 const p=cleanGame({players:[{key:'a',colorId:0,colorSource:'nebula',color:'#123456',shadowColor:'#654321',visorColor:'#abcdef',colorKnown:true}]}).players[0];
 const svg=nebulaSvg(p);for(const c of ['#123456','#654321','#abcdef'])assert.ok(svg.includes(c));assert.equal(svg.includes('#c51111'),false);
});
test('Nebulaの色を取得できない場合は標準色の画像に置換しない',()=>{
 const p=cleanGame({players:[{key:'a',colorId:0,colorSource:'nebula',color:'#8794a3',colorKnown:true}]}).players[0];assert.equal(p.colorKnown,false);assert.equal(nebulaSvg(p),null);
});
test('不正な影色をSVGに挿入しない',()=>{assert.equal(nebulaSvg({colorSource:'nebula',colorKnown:true,color:'#123456',shadowColor:'" onload="evil',visorColor:'#abcdef'}),null);});
