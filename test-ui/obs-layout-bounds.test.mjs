import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {createObsStyle} from '../lib/obs-style.mjs';import {defaults} from '../lib/state.mjs';

test('右側の大きな名前・未登録の入室・最大50人でも、表示対象が出力枠内に収まる',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const scenario of [
   {settings:{size:40,nameSize:40,gap:0,orientation:'vertical',verticalNamePosition:'right'},count:1,mapped:1},
   {settings:{size:40,nameSize:40,gap:0,orientation:'vertical',verticalNamePosition:'overlap'},count:1,mapped:1},
   {settings:{},count:6,mapped:1},
   {settings:{orientation:'vertical'},count:6,mapped:1},
   {settings:{orientation:'vertical',showCharacter:false},count:2,mapped:2},
   {settings:{orientation:'vertical',characterScale:160,size:40,nameSize:40,gap:0},count:2,mapped:2},
   {settings:{},count:6,mapped:6,hideFirst:true},
   ...['horizontal','vertical'].map(orientation=>({settings:{size:160,nameSize:40,characterScale:160,gap:60,orientation,verticalNamePosition:'right'},count:50,mapped:50})),
  ]){
   const players=Array.from({length:scenario.mapped},(_,i)=>({key:'p'+i,colorId:0,color:'#ca243e',lifeState:'alive'}));
   const links=players.map((p,i)=>({gameKey:p.key,discordId:String(345678901234567890n+BigInt(i)),label:'確認用の長い名前',visible:!(scenario.hideFirst&&i===0)}));
   const style=createObsStyle({preset:{settings:{...defaults,dimIdle:false,...scenario.settings},links},game:{displayPlayers:players}});
   assert.ok(style.width<=8192&&style.height<=8192);
   const page=await browser.newPage({viewport:{width:style.width,height:style.height}});
   await page.route('https://cdn.discordapp.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#546c82"/></svg>'}));
   const rows=Array.from({length:scenario.count},(_,i)=>`<li class="Voice_voiceState__OCoZh"><img class="Voice_avatar__htiqH" src="https://cdn.discordapp.com/avatars/${345678901234567890n+BigInt(i)}/fixture.png"><div class="Voice_user__8fGwX"><span class="Voice_name__TALd9">確認用メンバー${i+1}</span></div></li>`).join('');
   await page.setContent(`<html><head><style>body{margin:0;overflow:hidden;background:#152331;color:white;font:14px sans-serif}.Voice_voiceState__OCoZh{height:50px;margin-bottom:8px}.Voice_avatar__htiqH{border:3px solid transparent;border-radius:50%;float:left;height:50px;width:50px}.Voice_user__8fGwX{padding-top:18px}.Voice_name__TALd9{background:#262a33;padding:4px 6px;border-radius:3px}</style><style>${style.css}</style></head><body><ul class="Voice_voiceStates__a121W">${rows}</ul></body></html>`);
   const visible=page.locator('[class*=Voice_voiceState__]').filter({visible:true});assert.equal(await visible.count(),scenario.mapped);
   const bounds=await visible.evaluateAll(nodes=>nodes.flatMap(e=>[e,...e.querySelectorAll('img,span')].map(n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom};})));
   for(const box of bounds){assert.ok(box.left>=-.5&&box.top>=-.5&&box.right<=style.width+.5&&box.bottom<=style.height+.5,JSON.stringify({scenario,box,output:[style.width,style.height]}));}
   const placement=await visible.evaluateAll(nodes=>nodes.map(e=>{const row=e.getBoundingClientRect(),image=e.querySelector('img').getBoundingClientRect(),crew=getComputedStyle(e,'::before'),badge=getComputedStyle(e,'::after');return {row:{top:row.top,left:row.left,right:row.right,bottom:row.bottom},avatar:{left:image.left,top:image.top,right:image.right,bottom:image.bottom},crew:{shown:crew.content!=='none',left:row.left+parseFloat(crew.left),top:row.top+parseFloat(crew.top),width:parseFloat(crew.width),height:parseFloat(crew.height)}};}));
   for(const box of placement){
    if(scenario.settings.showCharacter===false)assert.equal(box.crew.shown,false);
    else if(scenario.settings.orientation==='vertical'){
     assert.ok(box.crew.left+box.crew.width<=box.avatar.left-7.5,'vertical crew must stay to the left of the avatar');
     assert.ok(box.crew.top>=box.row.top-.5&&box.crew.top+box.crew.height<=box.row.bottom+.5,'vertical crew must not protrude above or below the row');
     assert.ok(Math.abs(box.crew.top+box.crew.height/2-(box.avatar.top+box.avatar.bottom)/2)<=1,'crew and avatar must be centred vertically');
    }else assert.ok(box.crew.top<box.avatar.top,'horizontal placement must remain above');
   }
   if(scenario.count===6&&scenario.mapped===1)assert.equal(await page.locator('[class*=Voice_voiceState__]').nth(5).isVisible(),false);
   await page.close();
  }
 }finally{await browser.close();}
});
