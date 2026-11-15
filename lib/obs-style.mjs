import {readFileSync,mkdirSync,writeFileSync,renameSync,unlinkSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {colorIcon,spritePalette,statusBadgeSvg} from '../public/icons.js';
import {cleanStreamkitUrl} from '../public/streamkit.js';
const here=path.dirname(fileURLToPath(import.meta.url));
const dataImage=bytes=>'data:image/png;base64,'+bytes.toString('base64');
const cssString=text=>'"'+[...text].map(c=>'\\'+c.codePointAt(0).toString(16)+' ').join('')+'"';
const row=':is([class*="Voice_voiceState__"],.voice-state)',avatar=':is([class*="Voice_avatar__"],.avatar)',speaking=':is([class*="Voice_avatarSpeaking__"],.speaking)',user=':is([class*="Voice_user__"],.user)',name=':is([class*="Voice_name__"],.name)';
export function avatarSelector(id){if(!/^[0-9]{15,22}$/.test(id))throw Error('DiscordユーザーIDを確認してください。');return `${row}:has(img:is([src*="/avatars/${id}/"],[src*="/users/${id}/avatars/"]))`;}
export function createNativeSpriteEncoder(nativeImage,iconDirectory=path.join(here,'../public/icons')){
 const cache=new Map(),templates=new Map();let redIndex;
 const load=dead=>{if(templates.has(dead))return templates.get(dead);const image=nativeImage.createFromBuffer(readFileSync(path.join(iconDirectory,`aucyan${dead?'dead':''}.png`))).resize({width:128});if(image.isEmpty())throw Error('クルー画像を読み込めません。');const size=image.getSize(),bytes=image.toBitmap();templates.set(dead,{size,bytes});return templates.get(dead);};
 return player=>{
  const original=colorIcon(player);if(original)return dataImage(readFileSync(path.join(iconDirectory,path.basename(original))));
  const palette=spritePalette(player);if(!palette)return null;const dead=['dead','exiled'].includes(player.lifeState),key=JSON.stringify([dead,palette]);if(cache.has(key))return cache.get(key);
  if(redIndex===undefined){const {bytes}=load(false);let rgba=0,bgra=0;for(let i=0;i<bytes.length;i+=4){if(bytes[i+3]!==255)continue;if(Math.abs(bytes[i]-57)<10&&Math.abs(bytes[i+1]-254)<10&&Math.abs(bytes[i+2]-219)<10)rgba++;if(Math.abs(bytes[i+2]-57)<10&&Math.abs(bytes[i+1]-254)<10&&Math.abs(bytes[i]-219)<10)bgra++;}if(!rgba&&!bgra)throw Error('画像の色形式を確認できません。');redIndex=rgba>bgra?0:2;}
  const {bytes,size}=load(dead),out=Buffer.from(bytes),indices=[redIndex,1,2-redIndex];
  const seeds=dead?[[68,253,245,0,45],[36,167,189,1,45],[14,67,58,4,24]]:[[57,254,219,0,45],[36,169,190,1,45],[150,202,221,2,35],[79,125,162,3,35]];
  const targets=[palette.body,palette.shadow,palette.visor,palette.visorShadow,palette.deep].map(c=>c.slice(1).match(/../g).map(x=>parseInt(x,16)));
  for(let i=0;i<out.length;i+=4){if(!out[i+3])continue;let match=null,distance=Infinity;for(const seed of seeds){const d=indices.reduce((sum,j,k)=>sum+(out[i+j]-seed[k])**2,0);if(d<seed[4]**2&&d<distance){match=seed;distance=d;}}if(match)indices.forEach((j,k)=>out[i+j]=Math.max(0,Math.min(255,targets[match[3]][k]+bytes[i+j]-match[k])));}
  const result=nativeImage.createFromBitmap(out,{...size,scaleFactor:1}).toDataURL();if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
 };
}
export function createObsStyle(state,{spriteEncoder=null}={}){
 const s=state.preset.settings,size=s.size,gap=s.gap,vertical=s.orientation==='vertical',position=vertical?s.verticalNamePosition:s.horizontalNamePosition;
 const number=n=>Math.round(n*1000)/1000,showCrew=s.showCharacter!==false,showNames=s.showNames!==false,pad=s.colorBackground?8:0;
 const crewWidth=showCrew?number(size*(s.characterScale??100)/100*.72):0,crewHeight=showCrew?number(size*(s.characterScale??100)/100*.81):0;
 const overlap=position==='overlap',right=position==='right'&&showNames,below=position==='below'&&showNames;
 const nameLine=overlap?1.25:right||s.colorBackground?1.4:1.5,namePad=overlap?5:right||s.colorBackground?6:9,nameHeight=showNames?number(s.nameSize*nameLine+namePad):0;
 const innerHeight=vertical?Math.max(size,crewHeight,right?nameHeight:0):number(Math.max(0,crewHeight-(showCrew?3:0))+size+(below?nameHeight+(s.colorBackground?6:0):0));
 const innerWidth=vertical?number(crewWidth+(showCrew?12:0)+size):Math.max(size,crewWidth);
 const hop=number(s.motionHeight??size*.08*(s.motionStrength==='subtle'?.5:s.motionStrength==='strong'?1.5:1));
 // Reserve space inside each member band; outer canvas padding cannot stop
 // a bouncing sprite crossing its own background or an adjacent member.
 const motionTop=s.bounceSpeaking?Math.max(0,Math.ceil(hop+2-pad)):0;
 const baseAvatarTop=number(pad+(vertical?(innerHeight-size)/2:Math.max(0,crewHeight-(showCrew?3:0))));
 const motionBottom=s.bounceSpeaking&&s.showStatus!==false?Math.max(0,Math.ceil(baseAvatarTop+size+(overlap&&showNames?-size*.16:size*.06)+3-innerHeight-pad*2)):0;
 const rowHeight=number(innerHeight+pad*2+motionTop+motionBottom);
 const avatarLeft=number(pad+(vertical?crewWidth+(showCrew?12:0):(innerWidth-size)/2)),avatarTop=number(baseAvatarTop+motionTop);
 const crewLeft=number(pad+(vertical?0:(innerWidth-crewWidth)/2)),crewTop=number(pad+motionTop+(vertical?(innerHeight-crewHeight)/2:0));
 const maxRowWidth=number(innerWidth+pad*2+(right?12+size*2.5:0)),fixedRowWidth=number(innerWidth+pad*2);
 const gutter=Math.ceil(Math.max(18,size*.075+3,nameHeight-size+3,s.bounceSpeaking?hop+3:0));
 const players=new Map(state.game.displayPlayers.map(p=>[p.key,p])),links=state.preset.links;
 const count=Math.max(1,links.filter(l=>/^[0-9]{15,22}$/.test(l.discordId)&&players.has(l.gameKey)).length);
 const columns=vertical?Math.ceil(count/Math.max(1,Math.floor((8192-gutter*2+gap)/(rowHeight+gap)))):Math.min(count,Math.max(1,Math.floor((8192-gutter*2+gap)/(maxRowWidth+gap))));
 const rows=Math.ceil(count/columns),width=Math.ceil(columns*maxRowWidth+(columns-1)*gap+gutter*2),height=Math.ceil(rows*rowHeight+(rows-1)*gap+gutter*2);
 const nameBackground=overlap?`linear-gradient(transparent,rgba(11,19,30,${number((s.nameOpacity??92)/100*.85/.92)}))`:right||s.colorBackground?`rgba(17,24,32,${(s.nameOpacity??92)/100})`:'transparent';
 const namePadding=overlap?'3px 2px 2px':right?'3px 7px':s.colorBackground?'3px 6px':'9px 0 0';
 const userPosition=right?`position:relative!important;margin-left:${number(innerWidth+12)}px!important;top:${number((innerHeight-nameHeight)/2+motionTop)}px!important;width:max-content!important;max-width:${size*2.5}px!important;`:overlap?`position:absolute!important;left:${number(avatarLeft+size/2)}px!important;top:${number(avatarTop+size+2-nameHeight)}px!important;transform:translateX(-50%)!important;width:${number(size*1.15)}px!important;`: `position:absolute!important;left:${pad}px!important;top:${number(avatarTop+size+(s.colorBackground?6:0))}px!important;width:${innerWidth}px!important;`;
 let css=`/* Streamer crew link: generated styling */\n[class*="Voice_voiceStates__"],.voice-states{display:grid!important;grid-auto-flow:${vertical?'column':'row'}!important;grid-template-columns:repeat(${columns},${vertical?'max-content':fixedRowWidth+'px'})!important;grid-template-rows:repeat(${rows},${rowHeight}px)!important;gap:${gap}px!important;align-items:start!important;align-content:start!important;justify-content:start!important;list-style:none!important;padding:${gutter}px!important;margin:0!important;box-sizing:border-box!important;}\n${row}{display:none!important;position:relative!important;box-sizing:border-box!important;float:none!important;width:${vertical?(s.colorBackground?'auto':'max-content'):fixedRowWidth+'px'}!important;min-width:${fixedRowWidth}px!important;min-height:0!important;height:${rowHeight}px!important;padding:${pad}px!important;margin:0!important;order:9999;opacity:1!important;background:transparent!important;border:0!important;border-radius:4px!important;justify-self:${vertical&&!s.colorBackground?'start':'stretch'}!important;overflow:visible!important;font:14px/1.5 "Segoe UI","Yu Gothic UI",Meiryo,sans-serif!important;}\n${row} ${avatar}{position:absolute!important;left:${avatarLeft}px!important;top:${avatarTop}px!important;width:${size}px!important;height:${size}px!important;display:block!important;float:none!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:3px solid #526077!important;border-radius:${s.avatarShape==='square'?'0':s.avatarShape==='round'?'50%':'12px'}!important;object-fit:cover!important;opacity:1!important;filter:none!important;box-shadow:none!important;z-index:1!important;}\n${row} ${user}{${userPosition}display:${showNames?'block':'none'}!important;box-sizing:border-box!important;float:none!important;padding:0!important;margin-top:0!important;margin-bottom:0!important;bottom:auto!important;z-index:5!important;}\n${row} ${name}{font-family:"Segoe UI","Yu Gothic UI",Meiryo,sans-serif!important;font-size:${s.nameSize}px!important;font-weight:600!important;line-height:${nameLine}!important;width:${overlap?'100%':'max-content'}!important;max-width:100%!important;box-sizing:border-box!important;padding:${namePadding}!important;margin:0 ${right||overlap?'0':'auto'}!important;text-align:${right?'left':'center'}!important;color:#f1f5ff!important;background:${nameBackground}!important;border-radius:${overlap?'0 0 6px 6px':'4px'}!important;text-shadow:${overlap?'0 1px 3px #000,0 0 3px #000':'0 2px 4px #000'}!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;display:${showNames?'block':'none'}!important;}\n`;
 css+=`${row}:has(${speaking}) ${avatar}{border-color:#43d795!important;}\n`;
 if(s.dimIdle)css+=`${row}:not(:has(${speaking})) ${avatar}{filter:brightness(.6)!important;}\n`;
 if(s.bounceSpeaking){const moving=`${row}:has(${speaking}) ${avatar},${row}:has(${speaking})::before,${row}:has(${speaking})::after${overlap?','+row+':has('+speaking+') '+user:''}`;css+=`@keyframes scl-bounce{0%,100%{translate:0 0}50%{translate:0 -${hop}px}}${moving}{animation:scl-bounce .48s ease-in-out infinite!important;}@media(prefers-reduced-motion:reduce){${moving}{animation:none!important;}}\n`;}
 let mapped=0,skipped=0,present=0;
 for(const [order,link] of links.entries()){
  if(!/^[0-9]{15,22}$/.test(link.discordId)){skipped++;continue;}mapped++;const selector=avatarSelector(link.discordId),p=players.get(link.gameKey);
  css+=`${selector}{order:${order};display:${p?'block':'none'}!important;}\n`;
  if(link.label)css+=`${selector} ${name}{font-size:0!important;line-height:0!important;} ${selector} ${name}::after{content:${cssString(link.label)};font-size:${s.nameSize}px;line-height:${nameLine};display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n`;
  if(!p)continue;present++;
  if(p.colorKnown!==false&&/^#[a-f0-9]{6}$/i.test(p.color)){
   if(s.colorBackground)css+=`${selector}{background:${p.color}!important;}\n`;
   css+=`${selector}:has(${speaking}) ${avatar}{border-color:${p.color}!important;box-shadow:0 0 0 2px ${p.color},0 0 22px color-mix(in srgb,${p.color} 45%,transparent)!important;}\n`;
  }
  if(showCrew&&p.colorKnown!==false){let image=null;try{image=spriteEncoder?.(p)??(colorIcon(p)?dataImage(readFileSync(path.join(here,'../public',colorIcon(p)))):null);}catch{skipped++;}if(image)css+=`${selector}::before{content:"";position:absolute;pointer-events:none;width:${crewWidth}px;height:${crewHeight}px;left:${crewLeft}px;top:${crewTop}px;background:url("${image}") center/contain no-repeat;filter:drop-shadow(1px 0 white) drop-shadow(-1px 0 white) drop-shadow(0 1px white) drop-shadow(0 -1px white);z-index:2;}\n`;}
  const badge=s.showStatus!==false?statusBadgeSvg(p.lifeState):null;
  if(badge){const badgeSize=number(size*(s.badgeSize??42)/100),badgeBottom=overlap&&showNames?size*.16:-size*.06;css+=`${selector}::after{content:"";position:absolute;pointer-events:none;left:${number(avatarLeft+size+size*.06-badgeSize)}px;top:${number(avatarTop+size-badgeBottom-badgeSize)}px;width:${badgeSize}px;height:${badgeSize}px;background:url("data:image/svg+xml,${encodeURIComponent(badge)}") center/contain no-repeat;filter:drop-shadow(0 1px 2px #0008);z-index:6;}\n`;}
 }
 return {css,mapped,present,skipped,width:Math.min(8192,width),height:Math.min(8192,height)};
}
// Ignore transport-only metadata; it must not restart a pending visual update.
const visualKey=state=>JSON.stringify([state.preset.streamkitUrl,state.preset.settings,state.preset.links.map(l=>[l.gameKey,l.discordId,l.label]),state.game.displayPlayers.map(p=>[p.key,p.color,p.colorId,p.colorSource,p.shadowColor,p.visorColor,p.lifeState,p.colorKnown])]);
export class ObsStyleExport{
 constructor(directory,{spriteEncoder=null,now=Date.now,batchTiming={settleMs:750,maxWaitMs:1800}}={}){this.directory=path.join(directory,'obs-streamkit');this.spriteEncoder=spriteEncoder;this.now=now;this.batchTiming=batchTiming;this.enabled=false;this.info={enabled:false,mapped:0,present:0,skipped:0,error:''};this.revision='';this.fingerprint='';this.heartbeat=setInterval(()=>{if(this.enabled)this.status();},2000);this.heartbeat.unref();}
 write(name,data){mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,name);writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});renameSync(file+'.tmp',file);}
 cleanup(){for(const name of ['streamkit-style.json','streamkit-style.json.tmp'])try{unlinkSync(path.join(this.directory,name));}catch(e){if(e.code!=='ENOENT')this.info.error='連携ファイルを削除できません。';}}
 view(){return {...this.info,enabled:this.enabled};}
 status(){try{this.write('streamkit-status.json',{schema:1,active:this.enabled,revision:this.revision,updatedAt:this.now()});}catch{this.enabled=false;this.info.error='OBS連携ファイルを更新できません。保存先を確認してください。';}}
 clearPending(){clearTimeout(this.pending);this.pending=null;this.pendingKey='';this.pendingSince=null;}
 setEnabled(enabled,state){if(typeof enabled!=='boolean')throw Error('OBS連携の設定を確認してください。');if(enabled&&state.preset.settings.displaySource!=='streamkit')throw Error('表示方式を「Discord画像と合わせる」にして保存してください。');if(enabled&&!cleanStreamkitUrl(state.preset.streamkitUrl))throw Error('先にStreamkit URLを保存してください。');if(enabled){try{mkdirSync(this.directory,{recursive:true});writeFileSync(path.join(this.directory,'streamer-crew-link.lua'),readFileSync(path.join(here,'../obs/streamer-crew-link.lua')));}catch{this.enabled=false;throw Error('OBS連携ファイルを保存できません。');}}this.clearPending();this.enabled=enabled;this.info.error='';if(enabled){this.fingerprint='';this.revision='';this.flush(state);}else{this.status();this.cleanup();}return this.view();}
 update(state){
  this.latest=state;if(!this.enabled)return;
  if(!state.preset.streamkitUrl||state.preset.settings.displaySource!=='streamkit'||state.preset.streamkitUrl!==this.outputUrl){this.flush(state);return;}
  const key=visualKey(state);if(key===this.fingerprint){this.clearPending();return;}if(key===this.pendingKey)return;
  this.pendingKey=key;this.pendingSince??=performance.now();clearTimeout(this.pending);
  const delay=Math.max(0,Math.min(this.batchTiming.settleMs,this.batchTiming.maxWaitMs-(performance.now()-this.pendingSince)));
  this.pending=setTimeout(()=>this.flush(this.latest),delay);this.pending.unref();
 }

 flush(state){this.clearPending();if(!this.enabled)return;try{const url=cleanStreamkitUrl(state.preset.streamkitUrl);if(!url||state.preset.settings.displaySource!=='streamkit'){this.enabled=false;this.status();this.cleanup();return;}const fingerprint=visualKey(state);if(fingerprint===this.fingerprint)return;const generated=createObsStyle(state,{spriteEncoder:this.spriteEncoder});const revision=createHash('sha256').update(JSON.stringify([url,generated.css,generated.width,generated.height])).digest('hex').slice(0,16);if(revision!==this.revision){this.revision=revision;this.write('streamkit-style.json',{schema:1,revision:this.revision,url,css:generated.css,width:generated.width,height:generated.height});}this.outputUrl=url;this.info={enabled:true,mapped:generated.mapped,present:generated.present,skipped:generated.skipped,error:''};this.fingerprint=fingerprint;this.status();}catch{this.enabled=false;this.info.error='OBS連携用の表示設定を作成できません。';this.status();this.cleanup();}}
 close(){clearInterval(this.heartbeat);this.clearPending();if(this.enabled){this.enabled=false;this.status();}this.cleanup();}
}
