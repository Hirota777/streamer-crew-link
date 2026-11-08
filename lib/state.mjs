import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import {SettingsStorage} from './settings-storage.mjs';

export const defaults = {size:80, gap:14, characterScale:100, badgeSize:42, nameSize:12, colorBackground:false,bounceSpeaking:false,showCharacter:true, horizontalNamePosition:'below', verticalNamePosition:'overlap', orientation:'horizontal',showStatus:true,showNames:true, dimIdle:true};
export function cleanSettings(s={}) {
  for (const k of ['size','gap']) if (s[k]!==undefined && (!Number.isFinite(s[k]) || s[k] < (k==='size'?40:0) || s[k] > (k==='size'?160:60))) throw Error('表示サイズの範囲を確認してください。');
  for(const [key,min,max]of [['characterScale',50,160],['badgeSize',20,80]])if(s[key]!==undefined&&(!Number.isFinite(s[key])||s[key]<min||s[key]>max))throw Error('アイコンの大きさを確認してください。');
  if(s.nameSize!==undefined&&(!Number.isFinite(s.nameSize)||s.nameSize<8||s.nameSize>40))throw Error('表示名は8〜40 pxで設定してください。');
  for(const key of ['bounceSpeaking','showCharacter'])if(s[key]!==undefined&&typeof s[key]!=='boolean')throw Error('発言アニメーション・クルー表示の設定を確認してください。');
  if(s.colorBackground!==undefined&&typeof s.colorBackground!=='boolean')throw Error('背景色の設定を確認してください。');
  if(s.horizontalNamePosition!==undefined&&!['below','overlap'].includes(s.horizontalNamePosition))throw Error('横表示の名前の位置を確認してください。');
  if(s.verticalNamePosition!==undefined&&!['right','overlap'].includes(s.verticalNamePosition))throw Error('縦表示の名前の位置を確認してください。');
  if(s.orientation!==undefined&&!['horizontal','vertical'].includes(s.orientation))throw Error('並べ方を確認してください。');
  return {size:s.size??80,gap:s.gap??14,characterScale:s.characterScale??100,badgeSize:s.badgeSize??42,nameSize:s.nameSize??12,colorBackground:s.colorBackground===true,bounceSpeaking:s.bounceSpeaking===true,showCharacter:s.showCharacter!==false,horizontalNamePosition:s.horizontalNamePosition??'below',verticalNamePosition:s.verticalNamePosition??'overlap',orientation:s.orientation??'horizontal',showStatus:s.showStatus!==false,showNames:s.showNames!==false,dimIdle:s.dimIdle!==false};
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
  return {players,lifeTracking:body.lifeTracking===true,version:String(body.version??'').slice(0,80),modVersion:String(body.modVersion??'').slice(0,80),scene:String(body.scene??'').slice(0,80)};
}
export class Store {
  constructor(directory,options={}) {this.directory=directory;this.storage=new SettingsStorage(directory,options);this.file=this.storage.file;this.data={schema:1,active:'default',presets:[{id:'default',name:'いつものメンバー',links:[],settings:{...defaults}}]};this.queue=Promise.resolve();}
  async load(){
    await mkdir(this.directory,{recursive:true});
    try {
      const loaded=await this.storage.read(),d=loaded.data;
      if(loaded.missing){if(loaded.migrate)await this.storage.write(this.data);await this.storage.removeLegacy();return;}
      if(d.schema!==1||!Array.isArray(d.presets)||!d.presets.length) throw Error('保存データの形式が不正です。');
      const ids=new Set();
      const presets=d.presets.map(p=>{if(typeof p.id!=='string'||ids.has(p.id))throw Error('プリセットIDが不正です。');ids.add(p.id);return {id:p.id,name:String(p.name).slice(0,80),links:cleanLinks(p.links),settings:cleanSettings(p.settings)};});
      if(!ids.has(d.active))throw Error('選択中のプリセットが不正です。');
      const normalized={schema:1,active:d.active,presets};if(loaded.migrate)await this.storage.write(normalized);await this.storage.removeLegacy();this.data=normalized;
    }catch{throw Error('設定を読み込めません。暗号化機能、保存ファイルの破損・使用状態を確認してください。復元できないファイルは上書きしていません。');}
  }
  get current(){return this.data.presets.find(p=>p.id===this.data.active);}
  async mutate(action){
    const run=this.queue.then(async()=>{
      const next=structuredClone(this.data);action(next);
      await this.storage.write(next);this.data=next;
    });this.queue=run.catch(()=>{});return run;
  }
  async save(body){const links=cleanLinks(body.links),settings=cleanSettings(body.settings);await this.mutate(d=>{const p=d.presets.find(p=>p.id===d.active);Object.assign(p,{links,settings});});}
  async create(name){name=String(name??'').trim().slice(0,80);if(!name)throw Error('プリセット名を入力してください。');await this.mutate(d=>{if(d.presets.length>=30)throw Error('プリセットは30件以内にしてください。');const p=structuredClone(d.presets.find(p=>p.id===d.active));p.id=randomUUID();p.name=name;d.presets.push(p);d.active=p.id;});}
  async reset(){await this.mutate(d=>{d.active='default';d.presets=[{id:'default',name:'いつものメンバー',links:[],settings:{...defaults}}];});}
  async select(id){await this.mutate(d=>{if(!d.presets.some(p=>p.id===id))throw Error('プリセットが見つかりません。');d.active=id;});}
}
