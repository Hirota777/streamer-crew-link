import {cleanStreamkitUrl} from '../public/streamkit.js';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import {SettingsStorage} from './settings-storage.mjs';
import {mergeMemberLinks} from './member-merge.mjs';

export const defaults = {displaySource:'game',size:80, gap:14, characterScale:100, badgeSize:42, nameSize:12, colorBackground:false,bounceSpeaking:false,showCharacter:true, horizontalNamePosition:'below', verticalNamePosition:'overlap', orientation:'horizontal',showStatus:true,showNames:true, dimIdle:true,avatarShape:'rounded',nameOpacity:92,motionStrength:'normal',motionHeight:6.4};
export function cleanSettings(s={}) {
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('見た目設定の形式が不正です。');
  if(s.displaySource!==undefined&&!['discord','streamkit','game'].includes(s.displaySource))throw Error('表示モードを確認してください。');
  for (const k of ['size','gap']) if (s[k]!==undefined && (!Number.isFinite(s[k]) || s[k] < (k==='size'?40:0) || s[k] > (k==='size'?160:60))) throw Error('表示サイズの範囲を確認してください。');
  for(const [key,min,max]of [['characterScale',50,160],['badgeSize',20,80]])if(s[key]!==undefined&&(!Number.isFinite(s[key])||s[key]<min||s[key]>max))throw Error('アイコンの大きさを確認してください。');
  if(s.nameSize!==undefined&&(!Number.isFinite(s.nameSize)||s.nameSize<8||s.nameSize>40))throw Error('表示名は8〜40 pxで設定してください。');
  for(const key of ['bounceSpeaking','showCharacter'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw Error('発言アニメーション・クルー表示の設定を確認してください。');
  if(s.colorBackground!==undefined&&typeof s.colorBackground!=='boolean')throw Error('背景色の設定を確認してください。');
  if(s.horizontalNamePosition!==undefined&&!['below','overlap'].includes(s.horizontalNamePosition))throw Error('横表示の名前の位置を確認してください。');
  if(s.verticalNamePosition!==undefined&&!['right','overlap'].includes(s.verticalNamePosition))throw Error('縦表示の名前の位置を確認してください。');
  if(s.orientation!==undefined&&!['horizontal','vertical'].includes(s.orientation))throw Error('並べ方を確認してください。');
  if(s.avatarShape!==undefined&&!['round','rounded','square'].includes(s.avatarShape))throw Error('アイコンの形を確認してください。');
  if(s.nameOpacity!==undefined&&(!Number.isFinite(s.nameOpacity)||s.nameOpacity<0||s.nameOpacity>100))throw Error('名前背景の濃さを確認してください。');
  if(s.motionStrength!==undefined&&!['subtle','normal','strong'].includes(s.motionStrength))throw Error('アニメーションの強さを確認してください。');
  if(s.motionHeight!==undefined&&(!Number.isFinite(s.motionHeight)||s.motionHeight<0||s.motionHeight>32))throw Error('アニメーションの高さは0〜32 pxで設定してください。');
  return {motionHeight:s.motionHeight??Math.round((s.size??80)*.08*(s.motionStrength==='subtle'?.5:s.motionStrength==='strong'?1.5:1)*100)/100,avatarShape:s.avatarShape??'rounded',nameOpacity:s.nameOpacity??92,motionStrength:s.motionStrength??'normal',displaySource:s.displaySource==='discord'?'streamkit':s.displaySource??'game',size:s.size??80,gap:s.gap??14,characterScale:s.characterScale??100,badgeSize:s.badgeSize??42,nameSize:s.nameSize??12,colorBackground:s.colorBackground===true,bounceSpeaking:s.bounceSpeaking===true,showCharacter:s.showCharacter!==false,horizontalNamePosition:s.horizontalNamePosition??'below',verticalNamePosition:s.verticalNamePosition??'overlap',orientation:s.orientation??'horizontal',showStatus:s.showStatus!==false,showNames:s.showNames!==false,dimIdle:s.dimIdle!==false};
}
export function cleanLinks(rows) {
  if (!Array.isArray(rows)||rows.length>50) throw Error('対応づけは50件以内にしてください。');
  const keys=new Set(), users=new Set();
  return rows.map((r,i)=>{
    const gameKey=String(r.gameKey??'').slice(0,160), discordId=String(r.discordId??'').slice(0,80);
    if(!gameKey||!discordId||keys.has(gameKey)||users.has(discordId)) throw Error('同じ参加者を重複して対応づけることはできません。');
    keys.add(gameKey);users.add(discordId);
    return {gameKey,gameName:String(r.gameName??'').slice(0,80),discordId,label:String(r.label??'').slice(0,80),visible:r.visible!==false,order:i};
  });
}
export function cleanGame(body) {
  if (!Array.isArray(body.players)||body.players.length>50) throw Error('ゲーム情報の形式が不正です。');
  const keys=new Set();
  const players=body.players.map(p=>{
    const key=String(p.key??'').slice(0,160), color=String(p.color??'');
    if(!key||keys.has(key)||!/^#[\da-fA-F]{6}$/.test(color)) throw Error('プレイヤー情報が不正です。');
    keys.add(key);
    const colorSource=['nebula','snr'].includes(p.colorSource)?p.colorSource:'vanilla';
    const extra=c=>/^#[\da-fA-F]{6}$/.test(c??'')?c:null;
    const shadowColor=extra(p.shadowColor),visorColor=extra(p.visorColor);
    const dynamic=colorSource==='nebula'||(colorSource==='snr'&&(!Number.isInteger(p.colorId)||p.colorId>=18));
    const lifeState=['alive','dead','exiled'].includes(p.lifeState)?p.lifeState:'alive';
    return {lifeState,colorSource,shadowColor,visorColor,key,name:String(p.name??'').slice(0,80),color,colorId:Number.isInteger(p.colorId)?p.colorId:null,colorKnown:p.colorKnown!==false&&(!dynamic||!!(shadowColor&&visorColor)),stable:p.stable===true};
  });
  const departedKeys=Array.isArray(body.departedKeys)?[...new Set(body.departedKeys.slice(0,50).filter(key=>typeof key==='string'&&key.length>0&&key.length<=160))]:[];
  return {players,departedKeys,lifeTracking:body.lifeTracking===true,version:String(body.version??'').slice(0,80),modVersion:String(body.modVersion??'').slice(0,80),scene:String(body.scene??'').slice(0,80)};
}
export class Store {
  constructor(directory,options={}) {this.directory=directory;this.storage=new SettingsStorage(directory,options);this.file=this.storage.file;this.data=this.initial();this.queue=Promise.resolve();}
  // A single legacy member slot preserves existing save targets; only display presets can be managed.
  initial(){return {schema:2,uiSchema:1,memberSchema:1,streamkitSchema:1,activeStreamkit:'',streamkitProfiles:[],preferences:{autoStartObs:false},active:'default',activeDisplay:'default',presets:[{id:'default',name:'メンバー',links:[],streamkitUrl:''}],displayPresets:[{id:'default',name:'いつもの配信画面',settings:{...defaults}}]};}
  async load(){
    await mkdir(this.directory,{recursive:true});
    try {
      const loaded=await this.storage.read(),d=loaded.data;
      if(loaded.missing){if(loaded.migrate)await this.storage.write(this.data);await this.storage.removeLegacy();return;}
      if(!d||![1,2].includes(d.schema))throw Error('保存データの形式が不正です。');
      const normalized=this.normalize(d);

      if(loaded.migrate||d.schema===1||d.uiSchema!==1||d.memberSchema!==1||d.streamkitSchema!==1)await this.storage.write(normalized);await this.storage.removeLegacy();this.data=normalized;
    }catch{throw Error('設定を読み込めません。暗号化機能、保存ファイルの破損・使用状態を確認してください。');}
  }
  normalize(d){
    if(!d||![1,2].includes(d.schema))throw Error('保存データの形式が不正です。');
    const normalize=(items,active,kind)=>{if(!Array.isArray(items)||!items.length||items.length>30)throw Error('プリセット一覧が不正です。');const ids=new Set();const result=items.map(p=>{if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id))throw Error('プリセットIDが不正です。');ids.add(p.id);return {id:p.id,name:String(p.name).slice(0,80),...(kind==='display'?{settings:cleanSettings(p.settings)}:{links:cleanLinks(p.links),streamkitUrl:cleanStreamkitUrl(p.streamkitUrl)})};});if(!ids.has(active))throw Error('選択中のプリセットが不正です。');return result;};
    if(d.schema===1){normalize(d.presets,d.active,'members');for(const p of d.presets)cleanSettings(p.settings);return this.initial();}
    const result={schema:2,uiSchema:1,memberSchema:1,preferences:{autoStartObs:d.preferences?.autoStartObs===true},active:d.active,activeDisplay:d.activeDisplay,presets:normalize(d.presets,d.active,'members'),displayPresets:normalize(d.displayPresets,d.activeDisplay,'display')};
    if(d.uiSchema!==1&&result.presets.find(p=>p.id===result.active).streamkitUrl)result.displayPresets.find(p=>p.id===result.activeDisplay).settings.displaySource='streamkit';
    result.presets=[result.presets.find(p=>p.id===result.active)];result.presets[0].name='メンバー';
    result.streamkitSchema=1;
    if(d.streamkitSchema===1){
      if(!Array.isArray(d.streamkitProfiles)||d.streamkitProfiles.length>30||typeof d.activeStreamkit!=='string')throw Error('表示先一覧が不正です。');
      const ids=new Set(),names=new Set();result.streamkitProfiles=d.streamkitProfiles.map(p=>{if(!p||typeof p.id!=='string'||!p.id||p.id.length>80||ids.has(p.id)||!Number.isSafeInteger(p.revision)||p.revision<1)throw Error('表示先の形式が不正です。');const name=this.streamkitName(p.name),url=cleanStreamkitUrl(p.url);if(!url||names.has(name))throw Error('表示先の名前・URLを確認してください。');ids.add(p.id);names.add(name);return {id:p.id,name,url,revision:p.revision};});if(d.activeStreamkit&&!ids.has(d.activeStreamkit))throw Error('選択中の表示先が不正です。');result.activeStreamkit=d.activeStreamkit;
    }else{const url=result.presets[0].streamkitUrl;result.streamkitProfiles=url?[{id:'migrated-streamkit',name:'登録済みの表示先',url,revision:1}]:[];result.activeStreamkit=url?'migrated-streamkit':'';}
    this.syncStreamkit(result);return result;
  }
  get current(){return {...this.data.presets.find(p=>p.id===this.data.active),displayId:this.data.activeDisplay,settings:this.display.settings};}
  get display(){return this.data.displayPresets.find(p=>p.id===this.data.activeDisplay);}
  async mutate(action,{afterWrite=null}={}){
    const run=this.queue.then(async()=>{
      const next=structuredClone(this.data);await action(next);
      await this.storage.write(next);this.data=next;if(afterWrite)await afterWrite();
    });this.queue=run.catch(()=>{});return run;
  }
  async save(body,{settingsOnly=false}={}){
    const id=body.presetId??this.data.active,displayId=body.displayPresetId??this.data.activeDisplay;
    const streamkitUrl=body.streamkitUrl===undefined?null:cleanStreamkitUrl(body.streamkitUrl),streamkitTarget=this.data.activeStreamkit,streamkitRevision=this.data.streamkitProfiles.find(p=>p.id===streamkitTarget)?.revision??0;
    const links=!settingsOnly&&body.links!==undefined?cleanLinks(body.links):null,settings=body.settings!==undefined?cleanSettings(body.settings):null;
    const baseLinks=links!==null&&body.baseLinks!==undefined?cleanLinks(body.baseLinks):null;
    if(links===null&&settings===null&&streamkitUrl===null)throw Error('保存する変更がありません。');
    await this.mutate(d=>{const p=d.presets.find(p=>p.id===id),display=d.displayPresets.find(p=>p.id===displayId);if(((links!==null||streamkitUrl!==null)&&!p)||(settings!==null&&!display))throw Error('保存先のプリセットが見つかりません。画面を確認してください。');if(links!==null)p.links=baseLinks===null?links:mergeMemberLinks(baseLinks,p.links,links,cleanLinks);if(streamkitUrl!==null){if(d.activeStreamkit!==streamkitTarget||(d.streamkitProfiles.find(p=>p.id===streamkitTarget)?.revision??0)!==streamkitRevision)throw Error('表示先が切り替わりました。画面を確認して保存し直してください。');this.saveLegacyStreamkit(d,streamkitUrl);}if(settings!==null)display.settings=settings;});
  }
  streamkitName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw Error('表示先の名前を1〜80文字で入力してください。');return value.trim();}
  syncStreamkit(d){d.presets[0].streamkitUrl=d.streamkitProfiles.find(p=>p.id===d.activeStreamkit)?.url??'';}
  saveLegacyStreamkit(d,url){
    if(!url)d.activeStreamkit='';else{let p=d.streamkitProfiles.find(p=>p.id===d.activeStreamkit);if(p){p.url=url;p.revision++;}else{p=d.streamkitProfiles.find(p=>p.url===url);if(!p){if(d.streamkitProfiles.length>=30)throw Error('表示先は30件以内にしてください。');let name='登録済みの表示先',n=2;while(d.streamkitProfiles.some(p=>p.name===name))name='登録済みの表示先 '+n++;p={id:randomUUID(),name,url,revision:1};d.streamkitProfiles.push(p);}d.activeStreamkit=p.id;}}this.syncStreamkit(d);
  }
  async saveStreamkit(body){
    const name=this.streamkitName(body.name),url=cleanStreamkitUrl(body.url),id=body.id??'';if(!url)throw Error('Voice表示用URLを入力してください。');if(typeof id!=='string'||typeof body.expectedActiveId!=='string')throw Error('表示先を選び直してください。');const savedId=id||randomUUID();
    await this.mutate(d=>{if(d.streamkitProfiles.some(p=>p.name===name&&p.id!==id))throw Error('同じ名前の表示先があります。別の名前を入力してください。');if(id){const p=d.streamkitProfiles.find(p=>p.id===id);if(!p)throw Error('表示先が削除されています。選び直してください。');if(p.revision!==body.expectedRevision)throw Error('別の画面で表示先が更新されました。変更を元に戻してから編集し直してください。');Object.assign(p,{name,url,revision:p.revision+1});}else{if(d.streamkitProfiles.length>=30)throw Error('表示先は30件以内にしてください。');d.streamkitProfiles.push({id:savedId,name,url,revision:1});}if(d.activeStreamkit===body.expectedActiveId)d.activeStreamkit=savedId;this.syncStreamkit(d);});return savedId;
  }
  async selectStreamkit(id){if(typeof id!=='string')throw Error('表示先を選んでください。');await this.mutate(d=>{if(id&&!d.streamkitProfiles.some(p=>p.id===id))throw Error('表示先が見つかりません。');d.activeStreamkit=id;this.syncStreamkit(d);});}
  async removeStreamkit(id,revision){await this.mutate(d=>{const p=d.streamkitProfiles.find(p=>p.id===id);if(!p||p.revision!==revision)throw Error('表示先が更新・削除されています。選び直してください。');d.streamkitProfiles=d.streamkitProfiles.filter(p=>p.id!==id);if(d.activeStreamkit===id)d.activeStreamkit='';this.syncStreamkit(d);});}
  async create(name,sourceId,kind='display',values={}){
    this.displayKind(kind);sourceId??=this.data.activeDisplay;name=String(name??'').trim().slice(0,80);if(!name)throw Error('プリセット名を入力してください。');
    const settings=values.settings===undefined?null:cleanSettings(values.settings);
    await this.mutate(d=>{if(d.displayPresets.length>=30)throw Error('見た目プリセットは30件以内にしてください。');const source=d.displayPresets.find(p=>p.id===sourceId);if(!source)throw Error('元のプリセットが見つかりません。');const p={...structuredClone(source),...(settings?{settings}:{}),id:randomUUID(),name};d.displayPresets.push(p);d.activeDisplay=p.id;});
  }
  displayKind(kind){if(kind!=='display')throw Error('メンバープリセット機能は廃止されました。見た目プリセットを選んでください。');}
  async reset(){await this.mutate(d=>{const fresh=this.initial(),id=randomUUID();fresh.active=id;fresh.presets[0].id=id;Object.assign(d,fresh);},{afterWrite:()=>this.storage.clearOldBackups()});}
  async select(id,kind='display'){this.displayKind(kind);await this.mutate(d=>{if(!d.displayPresets.some(p=>p.id===id))throw Error('プリセットが見つかりません。');d.activeDisplay=id;});}
  async rename(id,name,kind='display'){
    this.displayKind(kind);name=String(name??'').trim().slice(0,80);if(!name)throw Error('プリセット名を入力してください。');await this.mutate(d=>{const p=d.displayPresets.find(p=>p.id===id);if(!p)throw Error('プリセットが見つかりません。');p.name=name;});
  }
  async remove(id,kind='display'){
    this.displayKind(kind);await this.mutate(d=>{if(d.displayPresets.length===1)throw Error('最後のプリセットは削除できません。');if(!d.displayPresets.some(p=>p.id===id))throw Error('プリセットが見つかりません。');d.displayPresets=d.displayPresets.filter(p=>p.id!==id);if(d.activeDisplay===id)d.activeDisplay=d.displayPresets[0].id;});
  }
  exportPreset(kind='display',id=null){
    this.displayKind(kind);const current=this.data.displayPresets.find(p=>p.id===(id??this.data.activeDisplay));if(!current)throw Error('プリセットが見つかりません。');return {format:'streamer-crew-link-preset',version:1,kind:'display',preset:structuredClone({name:current.name,settings:current.settings})};
  }
  cleanImport(value){
    if(!value||value.format!=='streamer-crew-link-preset'||value.version!==1||value.kind!=='display'||!value.preset)throw Error('見た目プリセットのファイルを選んでください。');
    if(Object.keys(value).some(k=>!['format','version','kind','preset'].includes(k)))throw Error('読み込みファイルに不明な情報が含まれています。');
    const p=value.preset;if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['name','settings'].includes(k)))throw Error('読み込みファイルに不明な情報が含まれています。');if(!p.settings||typeof p.settings!=='object'||Array.isArray(p.settings))throw Error('見た目設定がありません。');
    const name=String(p.name??'').trim().slice(0,80);if(!name)throw Error('プリセット名がありません。');return {kind:'display',name,settings:cleanSettings(p.settings)};
  }
  async importPreset(value){const p=this.cleanImport(value);await this.create(p.name+'（読み込み）',undefined,'display',p);}
  async preferences(value){if(typeof value.autoStartObs!=='boolean')throw Error('自動再開の設定を確認してください。');await this.mutate(d=>{d.preferences={autoStartObs:value.autoStartObs};});}

}
