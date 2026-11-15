import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import path from 'node:path';
import {createObsStyle} from '../lib/obs-style.mjs';import {defaults} from '../lib/state.mjs';
test('公式CSSクラスを使った表示検証：IDで一致、並べ替え・初期アバター・縦横・死亡マーク',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:760,height:430}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://cdn.discordapp.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#344e67"/><circle cx="40" cy="29" r="15" fill="#d8e1ee"/><ellipse cx="40" cy="70" rx="30" ry="22" fill="#d8e1ee"/></svg>'}));
  const first='345678901234567890',second='456789012345678901';
  const players=[{key:'a',name:'生存サンプル',color:'#ca243e',colorId:0,lifeState:'alive'},{key:'b',name:'死亡サンプル',color:'#253fcd',colorId:1,lifeState:'dead'}];
  const links=[{gameKey:'a',discordId:first,label:'とても長い表示名（折り返し防止の検証）'},{gameKey:'b',discordId:second,label:'死亡サンプル'}];
  const row=(key,src,speaking=false)=>`<li id="${key}" class="Voice_voiceState__OCoZh"><img class="Voice_avatar__htiqH ${speaking?'Voice_avatarSpeaking__lE+4m':''}" src="${src}"><div class="Voice_user__8fGwX"><span class="Voice_name__TALd9">Voice user</span></div></li>`;
  const markup=`<html><head><style>body{background:#17222d;color:white;font:14px sans-serif}.Voice_avatar__htiqH{border:3px solid transparent;border-radius:50%;float:left;height:50px;width:50px}.Voice_avatarSpeaking__lE\\+4m{border-color:#43d795}.Voice_name__TALd9{background:#262a33;padding:4px 6px;border-radius:3px}</style><style id="generated"></style></head><body><p>Streamkit重ね合わせ · 検証用サンプル（実通話ではありません）</p><ul class="Voice_voiceStates__a121W">${row('a',`https://cdn.discordapp.com/avatars/${first}/sample.png`,true)}${row('b',`https://cdn.discordapp.com/guilds/123/users/${second}/avatars/sample.png`)}${row('default','https://cdn.discordapp.com/embed/avatars/0.png')}</ul></body></html>`;
  await page.setContent(markup);const set=async settings=>{const style=createObsStyle({preset:{settings:{...defaults,dimIdle:false,colorBackground:true,...settings},links},game:{displayPlayers:players}});await page.locator('#generated').evaluate((e,css)=>e.textContent=css,style.css);};await set({});
  const pseudo=async(id,type,key)=>page.locator('#'+id).evaluate((e,{type,key})=>getComputedStyle(e,type)[key],{type,key});
  assert.match(await pseudo('a','::before','backgroundImage'),/data:image\/png/);assert.match(await pseudo('b','::after','backgroundImage'),/data:image\/svg/);assert.equal(await pseudo('a','::after','backgroundImage'),'none');assert.equal(await pseudo('default','::before','backgroundImage'),'none');
  await page.locator('#a').evaluate(e=>e.parentElement.append(e));assert.equal(await page.locator('#a').evaluate(e=>getComputedStyle(e).order),'0');assert.match(await pseudo('a','::before','backgroundImage'),/data:image\/png/);
  assert.equal(await page.locator('#a [class*=Voice_name__]').evaluate(e=>getComputedStyle(e).whiteSpace),'nowrap');
  const dimensions=await page.locator('#a [class*=Voice_name__]').evaluate(e=>({height:e.getBoundingClientRect().height,line:parseFloat(getComputedStyle(e,'::after').fontSize)*1.5+8}));assert.ok(dimensions.height<=dimensions.line+1,'long name must occupy only one line');
  await page.screenshot({path:path.resolve('../../../outputs/Streamkit-0.2.3-重ね合わせ横-検証用.png')});
  await set({orientation:'vertical',verticalNamePosition:'right',showCharacter:false,bounceSpeaking:true});assert.equal(await pseudo('a','::before','backgroundImage'),'none');assert.equal(await page.locator('#a img').evaluate(e=>getComputedStyle(e).animationName),'scl-bounce');assert.match(await pseudo('b','::after','backgroundImage'),/data:image\/svg/);
  await set({orientation:'vertical',verticalNamePosition:'right'});await page.screenshot({path:path.resolve('../../../outputs/Streamkit-0.2.3-重ね合わせ縦-検証用.png')});assert.deepEqual(errors,[]);
  // The longest permitted font with the smallest icon must fit the exported height.
  const small={...defaults,size:40,gap:0,nameSize:40,showNames:true};const exported=createObsStyle({preset:{settings:small,links},game:{displayPlayers:players}});
  await page.locator('#default').evaluate(e=>e.remove());await set(small);
  const height=await page.locator('[class*=Voice_voiceStates__]').evaluate(e=>e.getBoundingClientRect().height);assert.ok(height<=exported.height+1,`content ${height} must fit exported height ${exported.height}`);
 }finally{await browser.close();}
});
