import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

export const defaults = {size:80, gap:14, showNames:true, dimIdle:true};
export function cleanSettings(s={}) {
  for (const k of ['size','gap']) if (s[k]!==undefined && (!Number.isFinite(s[k]) || s[k] < (k==='size'?40:0) || s[k] > (k==='size'?160:60))) throw Error('表示サイズの範囲を確認してください。');
  return {size:s.size??80,gap:s.gap??14,showNames:s.showNames!==false,dimIdle:s.dimIdle!==false};
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
    return {colorSource,shadowColor,visorColor,key,name:String(p.name??'').slice(0,80),color,colorId:Number.isInteger(p.colorId)?p.colorId:null,colorKnown:p.colorKnown!==false&&(!dynamic||!!(shadowColor&&visorColor)),stable:p.stable===true};
  });
  return {players,version:String(body.version??'').slice(0,80),modVersion:String(body.modVersion??'').slice(0,80),scene:String(body.scene??'').slice(0,80)};
}
export class Store {
  constructor(directory) {this.directory=directory;this.file=path.join(directory,'settings.json');this.data={schema:1,active:'default',presets:[{id:'default',name:'いつものメンバー',links:[],settings:{...defaults}}]};this.queue=Promise.resolve();}
  async load(){
    await mkdir(this.directory,{recursive:true});
    try {
      const d=JSON.parse(await readFile(this.file,'utf8'));
      if(d.schema!==1||!Array.isArray(d.presets)||!d.presets.length) throw Error('保存データの形式が不正です。');
      const ids=new Set();
      const presets=d.presets.map(p=>{if(typeof p.id!=='string'||ids.has(p.id))throw Error('プリセットIDが不正です。');ids.add(p.id);return {id:p.id,name:String(p.name).slice(0,80),links:cleanLinks(p.links),settings:cleanSettings(p.settings)};});
      if(!ids.has(d.active))throw Error('選択中のプリセットが不正です。');
      this.data={schema:1,active:d.active,presets};
    }catch(e){if(e.code!=='ENOENT')throw Error('設定を読み込めません。data/settings.jsonを確認してください。元のファイルは上書きしていません。');}
  }
  get current(){return this.data.presets.find(p=>p.id===this.data.active);}
  async mutate(action){
    const run=this.queue.then(async()=>{
      const next=structuredClone(this.data);action(next);
      const temp=this.file+'.tmp';await writeFile(temp,JSON.stringify(next,null,2),'utf8');await rename(temp,this.file);this.data=next;
    });this.queue=run.catch(()=>{});return run;
  }
  async save(body){const links=cleanLinks(body.links),settings=cleanSettings(body.settings);await this.mutate(d=>{const p=d.presets.find(p=>p.id===d.active);Object.assign(p,{links,settings});});}
  async create(name){name=String(name??'').trim().slice(0,80);if(!name)throw Error('プリセット名を入力してください。');await this.mutate(d=>{if(d.presets.length>=30)throw Error('プリセットは30件以内にしてください。');const p=structuredClone(d.presets.find(p=>p.id===d.active));p.id=randomUUID();p.name=name;d.presets.push(p);d.active=p.id;});}
  async select(id){await this.mutate(d=>{if(!d.presets.some(p=>p.id===id))throw Error('プリセットが見つかりません。');d.active=id;});}
}
