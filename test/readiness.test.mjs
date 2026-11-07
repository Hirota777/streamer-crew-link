import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectionAdvice,preflight} from '../public/readiness.js';
function ready(){const player={key:'p',colorKnown:true},member={id:'d'};const link={gameKey:'p',discordId:'d',visible:true};return {mode:'live',reader:{status:'connected',message:'読取中'},game:{online:true,players:[player]},discord:{status:'接続中',members:[member],auth:{saved:true,autoConnect:true}},preset:{links:[link]},rows:[{...link,player,member}]};}
test('配信前チェックは実接続・対応づけ・保存・手動OBS確認がそろった場合だけ完了',()=>{
 const state=ready();assert.equal(preflight(state).ready,false);assert.equal(preflight(state,{obsConfirmed:true}).ready,true);
 assert.equal(preflight(state,{obsConfirmed:true,pending:true}).ready,false);
 state.mode='demo';assert.equal(preflight(state,{obsConfirmed:true}).done,0);
});
test('色待ち・未設定・不在のメンバーがある場合は準備完了にしない',()=>{
 const state=ready();state.game.players[0].colorKnown=false;assert.equal(preflight(state,{obsConfirmed:true}).ready,false);
 state.game.players[0].colorKnown=true;state.game.players.push({key:'new'});assert.equal(preflight(state,{obsConfirmed:true}).checks.find(c=>c.id==='mapping').ok,false);
 state.game.players.pop();state.rows[0].member=null;assert.equal(preflight(state,{obsConfirmed:true}).ready,false);
});
test('意図して非表示にした対応づけ済みメンバーは配信前チェックを妨げない',()=>{
 const state=ready(),player={key:'hidden'};state.game.players.push(player);state.preset.links.push({gameKey:'hidden',visible:false});state.rows.push({gameKey:'hidden',visible:false,player,member:null});assert.equal(preflight(state,{obsConfirmed:true}).ready,true);
});
test('ゲームの未対応・読取エラー・ロビー待ち・色待ちを区別する',()=>{
 const state=ready();state.reader.status='unsupported';assert.equal(connectionAdvice(state).game.target,'versions');
 state.reader.status='error';assert.match(connectionAdvice(state).game.title,/読み取れません/);
 state.reader.status='connected';state.game.players=[];assert.match(connectionAdvice(state).game.title,/ロビー/);
});
test('Discordの許可・通話待ち・手動停止・再試行と再試行の原因を区別する',()=>{
 const state=ready();state.discord.auth.needsAuthorization=true;assert.equal(connectionAdvice(state).discord.target,'authorize');
 state.discord.auth.needsAuthorization=false;state.discord.status='通話への参加を待っています';assert.equal(connectionAdvice(state).discord.target,'channel');
 state.discord.status='切断しました';state.discord.auth.autoConnect=false;assert.equal(connectionAdvice(state).discord.target,'reconnect');
 state.discord.auth.autoConnect=true;state.discord.auth.lastError='Discordデスクトップ版を起動してください。';assert.match(connectionAdvice(state).discord.detail,/デスクトップ/);
 state.discord.auth.busy=true;assert.match(connectionAdvice(state).discord.title,/進めています/);
});
