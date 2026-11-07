import {EventEmitter} from 'node:events';
import {Discord} from './discord.mjs';
import {APPLICATION} from './application.mjs';

export class DiscordSession extends EventEmitter {
  constructor({vault=null,client=new Discord(),application=APPLICATION,schedule=setTimeout,cancel=clearTimeout,now=Date.now}={}){
    super();Object.assign(this,{vault,client,application,schedule,cancel,now});this.record=null;this.persisted=false;this.storageAvailable=false;this.paused=false;this.needsAuthorization=false;this.busy=false;this.generation=0;this.attempts=0;this.timer=null;this.status='初回のDiscord連携が必要です';this.lastError='';
    client.on('change',()=>{if(!this.paused&&!this.needsAuthorization&&(this.busy||this.record))this.status=client.status;this.emit('change');});
    client.on('disconnect',()=>{if(!this.busy&&!this.paused&&this.record){this.lastError=client.status;this.status='Discordとの再接続を待っています';this.emit('change');this.retry();}});
  }
  get members(){return this.client.members;}
  get channel(){return this.client.channel;}
  info(){return {lastError:this.lastError,storageAvailable:this.storageAvailable,saved:this.persisted,autoConnect:this.persisted&&!this.paused&&!this.needsAuthorization,needsAuthorization:this.needsAuthorization,busy:this.busy,clientId:this.application.clientId,channelId:this.record?.credentials.channelId??'',redirectUri:this.application.redirectUri};}
  async initialize(){
    try{this.storageAvailable=Boolean(this.vault&&await this.vault.available());this.record=this.vault?await this.vault.load():null;if(this.record){if(this.record.credentials.clientId!==this.application.clientId){this.record=null;}else{this.record={...this.record,credentials:{...this.application,channelId:this.record.credentials.channelId||''}};await this.vault.save(this.record);}}this.persisted=Boolean(this.record);this.status=this.record?'保存済みの認証で接続します':'初回のDiscord連携が必要です';}
    catch(e){this.status=e.message;this.needsAuthorization=true;}
  }
  clearTimer(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;}
  retry(delay){
    this.clearTimer();if(this.paused||this.needsAuthorization||!this.record)return;
    const wait=delay??Math.min(5000*2**Math.min(this.attempts++,3),30000);
    this.timer=this.schedule(()=>{this.timer=null;this.resume().catch(()=>{});},wait);this.timer?.unref?.();
  }
  async start(){if(this.record&&!this.needsAuthorization)return this.resume().catch(()=>{});}
  async reconnect(){if(!this.record)throw Error('初回のDiscord連携を行ってください。');if(this.needsAuthorization)throw Error('「Discordと連携・許可」を押して許可をやり直してください。');this.paused=false;this.attempts=0;return this.resume();}
  async connect(options={}){
    if(this.busy)throw Error('接続処理中です。Discordの許可画面を確認してください。');
    const previous=this.record?.credentials;
    const credentials={...this.application,channelId:String(options.channelId??previous?.channelId??'')};
    const remember=options.remember!==false;
    if(remember&&!this.storageAvailable)throw Error('認証を保存できません。デスクトップ版のWindows暗号化機能を確認してください。');
    if(!remember){
      const generation=this.generation;this.busy=true;
      try{await this.vault?.clear();if(generation!==this.generation)return;this.persisted=false;}
      finally{if(generation===this.generation)this.busy=false;}
    }
    this.paused=false;this.needsAuthorization=false;this.clearTimer();this.attempts=0;
    return this.attempt(credentials,{interactive:true,remember});
  }
  async resume(){
    if(this.busy||this.paused||this.needsAuthorization||!this.record)return;
    return this.attempt(this.record.credentials,{interactive:false,remember:this.persisted,tokens:this.record.tokens});
  }
  async attempt(credentials,{interactive,remember,tokens}){
    const generation=++this.generation;this.busy=true;this.clearTimer();
    let record={schema:1,credentials,tokens};
    try{
      await this.client.connect({...credentials,tokens,interactive,onToken:async next=>{
        if(generation!==this.generation)throw Error('接続をキャンセルしました。');
        record={schema:1,credentials,tokens:next};
        if(remember)await this.vault.save(record);
        if(generation!==this.generation)throw Error('接続をキャンセルしました。');
        this.record=record;this.persisted=remember;
      }});
      if(generation!==this.generation)return;
      this.record=record;
      if(remember){await this.vault.save(record);if(generation!==this.generation)return;this.persisted=true;}else{await this.vault?.clear();if(generation!==this.generation)return;this.persisted=false;}
      this.lastError='';this.status=this.client.status;this.needsAuthorization=false;this.attempts=0;
      // Refresh before expiration, also while the voice channel is idle.
      this.retry(Math.min(2147480000,Math.max(1000,record.tokens.expiresAt-this.now()-60000)));
    }catch(e){
      if(generation!==this.generation)return;
      this.lastError=String(e.message||'接続に失敗しました。').slice(0,240);this.client.close();
      if(e.authRequired){this.needsAuthorization=true;this.status='Discordの許可をやり直してください。登録アプリのRPC利用条件も確認してください。';}
      else if(!interactive&&e.retryable!==false){this.status='Discordへの自動接続を待っています';this.retry();}
      else this.status=e.message||'Discordに接続できませんでした。';
      if(interactive)throw Error(this.status);
    }finally{if(generation===this.generation)this.busy=false;this.emit('change');}
  }
  disconnect(){this.lastError='';this.generation++;this.busy=false;this.paused=true;this.clearTimer();this.client.close();this.status=this.persisted?'切断しました。次回起動時は自動接続します':'未接続';this.emit('change');}
  async forget(){this.disconnect();await this.vault?.clear();this.record=null;this.persisted=false;this.needsAuthorization=false;this.status='保存済み認証を削除しました。初回連携が必要です';this.emit('change');}
  shutdown(){this.disconnect();}
}
