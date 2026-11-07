import net from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {oauthFailure,rpcFailure} from './auth-errors.mjs';

export function frame(op, data) {const payload=Buffer.from(JSON.stringify(data));const h=Buffer.alloc(8);h.writeUInt32LE(op);h.writeUInt32LE(payload.length,4);return Buffer.concat([h,payload]);}
export class Decoder {
  buffer=Buffer.alloc(0);
  push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);const frames=[];while(this.buffer.length>=8){const size=this.buffer.readUInt32LE(4);if(size>4*1024*1024)throw Error('Discord応答が大きすぎます。');if(this.buffer.length<8+size)break;frames.push({op:this.buffer.readUInt32LE(0),data:JSON.parse(this.buffer.subarray(8,8+size).toString())});this.buffer=this.buffer.subarray(8+size);}return frames;}
}
export class Discord extends EventEmitter {
  constructor({fetcher=fetch,now=Date.now,authorize,cancelAuthorization}={}){super();this.pending=new Map();this.socket=null;this.channel=null;this.members=[];this.status='未接続';Object.assign(this,{fetcher,now,authorize,cancelAuthorization});}
  update(status){this.status=status;this.emit('change');}
  assertCurrent(epoch){if(epoch!==this.epoch)throw Error('接続をキャンセルしました。');}
  async open(clientId,epoch=this.epoch){
    for(let n=0;n<10;n++){
      let connected;
      try {connected=await new Promise((resolve,reject)=>{const s=net.createConnection('\\\\?\\pipe\\discord-ipc-'+n);const timer=setTimeout(()=>s.destroy(Error('接続タイムアウト')),1500);s.once('error',reject);s.once('connect',()=>{clearTimeout(timer);s.removeListener('error',reject);resolve(s);});s.once('close',()=>clearTimeout(timer));});}catch{}
      if(epoch!==this.epoch){connected?.destroy();this.assertCurrent(epoch);}
      if(connected){this.socket=connected;break;}
    }
    if(!this.socket)throw Error('Discordデスクトップ版を起動してください。');
    const decoder=new Decoder();
    this.socket.on('error',()=>this.close('Discordとの接続が切れました。',true));
    this.socket.on('close',()=>this.close('Discordとの接続が切れました。',true));
    const ready=new Promise((resolve,reject)=>{this.ready={resolve,reject,timer:setTimeout(()=>reject(Error('Discordから応答がありません。')),8000)};});
    this.socket.on('data',chunk=>{try{for(const f of decoder.push(chunk)){
      if(f.op===3){this.socket?.write(frame(4,f.data));continue;}
      if(f.op===2){this.close('Discordから接続を終了されました。',true);continue;}
      const p=f.data;
      if(p.evt==='READY'){clearTimeout(this.ready?.timer);this.ready?.resolve();this.ready=null;}
      if(p.nonce&&this.pending.has(p.nonce)){const job=this.pending.get(p.nonce);this.pending.delete(p.nonce);clearTimeout(job.timer);if(p.evt==='ERROR'){job.reject(rpcFailure(p.data?.code,job.command));}else job.resolve(p.data);}
      if(p.cmd==='DISPATCH')this.dispatch(p);
    }}catch{this.close('Discordの応答を読み取れませんでした。',true);}});
    this.socket.write(frame(0,{v:1,client_id:clientId}));await ready;
  }
  call(cmd,args={},evt){return new Promise((resolve,reject)=>{if(!this.socket)return reject(Error('Discordが未接続です。'));const nonce=randomUUID();const timer=setTimeout(()=>{this.pending.delete(nonce);reject(Error('Discordの応答がタイムアウトしました。'));},60000);this.pending.set(nonce,{resolve,reject,timer,command:cmd});this.socket.write(frame(1,{cmd,args,nonce,...(evt?{evt}:{})}));});}
  async exchange(credentials,parameters,oldTokens){
    let response;
    try{response=await this.fetcher('https://discord.com/api/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:credentials.clientId,...parameters}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Discordの認証サーバーへ接続できません。');}
    if(!response.ok){let data;try{data=await response.json();}catch{}throw oauthFailure(response.status,data,parameters.grant_type);}
    let token;try{token=await response.json();}catch{throw Error('Discordの認証応答を確認できませんでした。');}
    if(typeof token.access_token!=='string'||!Number.isFinite(token.expires_in)||token.expires_in<=0)throw Error('Discordの認証応答を確認できませんでした。');
    return {accessToken:token.access_token,refreshToken:token.refresh_token||oldTokens?.refreshToken||'',expiresAt:this.now()+token.expires_in*1000};
  }
  async connect({clientId,redirectUri,channelId,tokens,interactive=true,onToken=async()=>{}}){
    this.close('接続準備中');
    const epoch=this.epoch;
    if(!/^\d{15,22}$/.test(clientId??''))throw Error('Discord Application IDを確認してください。');
    if(channelId&&!/^\d{15,22}$/.test(channelId))throw Error('チャンネルIDを確認してください。');
    try {
      this.update(interactive?'Discordの許可画面を確認してください':'保存済みの認証で自動接続しています');await this.open(clientId,epoch);this.assertCurrent(epoch);
      if(interactive){
        if(!this.authorize)throw Error('Discord連携はデスクトップアプリから実行してください。');
        const {code,verifier}=await this.authorize();
        this.assertCurrent(epoch);
        tokens=await this.exchange({clientId},{grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier});
        this.assertCurrent(epoch);
        await onToken(tokens);
      }else if(!tokens||tokens.expiresAt<=this.now()+60000){
        if(!tokens?.refreshToken){const e=Error('初回のDiscord連携が必要です。');e.authRequired=true;throw e;}
        tokens=await this.exchange({clientId},{grant_type:'refresh_token',refresh_token:tokens.refreshToken},tokens);
        this.assertCurrent(epoch);
        // Persist rotated refresh tokens immediately; do not lose them if the
        // subsequent local IPC authentication is interrupted.
        await onToken(tokens);
      }
      this.assertCurrent(epoch);
      await this.call('AUTHENTICATE',{access_token:tokens.accessToken});
      this.assertCurrent(epoch);
      this.targetId=channelId||null;
      await this.call('SUBSCRIBE',{},'VOICE_CHANNEL_SELECT');this.assertCurrent(epoch);await this.refresh();this.assertCurrent(epoch);
      this.poll=setInterval(()=>this.refreshSafely('Discord情報の更新に失敗しました。'),10000);
    }catch(e){if(epoch===this.epoch)this.close('接続失敗：'+e.message);throw e;}
  }
  refreshSafely(message){const epoch=this.epoch;return this.refresh().catch(()=>{if(epoch===this.epoch)this.close(message,true);});}
  refresh(){
    if(this.refreshJob){this.refreshJob.again=true;return this.refreshJob.promise;}
    const job={epoch:this.epoch,again:false};this.refreshJob=job;
    job.promise=this.drainRefresh(job).finally(()=>{if(this.refreshJob===job)this.refreshJob=null;});return job.promise;
  }
  async drainRefresh(job){
    do{job.again=false;await this.refreshOnce(job.epoch);}while(job.again&&job.epoch===this.epoch);
  }
  async refreshOnce(epoch){
    const selectionRevision=this.selectionRevision;
    const currentCall=async(...args)=>{const value=await this.call(...args);this.assertCurrent(epoch);return value;};
    this.assertCurrent(epoch);
    try {
      let c=await currentCall(this.targetId?'GET_CHANNEL':'GET_SELECTED_VOICE_CHANNEL',this.targetId?{channel_id:this.targetId}:{});
      const invalidTarget=Boolean(c&&this.targetId&&(!c.guild_id||![2,13].includes(c.type)));
      if(c&&(!c.guild_id||![2,13].includes(c.type)))c=null;
      const old=this.channel;
      const subscribed=this.subscribedChannel;
      if(subscribed?.id!==c?.id){
        for(const evt of ['SPEAKING_START','SPEAKING_STOP','VOICE_STATE_CREATE','VOICE_STATE_UPDATE','VOICE_STATE_DELETE']){
          if(subscribed)await currentCall('UNSUBSCRIBE',{channel_id:subscribed.id},evt);
          if(c)await currentCall('SUBSCRIBE',{channel_id:c.id},evt);
        }
      }
      this.subscribedChannel=c;
      if(selectionRevision!==this.selectionRevision)return;
      this.channel=c;
      this.members=(c?.voice_states??[]).map(v=>({id:v.user.id,name:v.nick||v.user.global_name||v.user.username,avatar:v.user.avatar?`https://cdn.discordapp.com/avatars/${v.user.id}/${v.user.avatar}.png?size=128`:null,speaking:old?.id===c.id&&(this.members.find(m=>m.id===v.user.id)?.speaking??false)}));
      this.update(c?'接続中':invalidTarget?'指定したIDはサーバーの通話ではありません':'通話への参加を待っています');
    }catch(e){throw e;}
  }
  dispatch(p){
    if(['SPEAKING_START','SPEAKING_STOP'].includes(p.evt)){
      if(p.data?.channel_id&&p.data.channel_id!==this.channel?.id)return;
      const m=this.members.find(m=>m.id===p.data?.user_id);if(m){m.speaking=p.evt==='SPEAKING_START';this.emit('change');}
    }
    if(p.evt==='VOICE_CHANNEL_SELECT'&&!this.targetId){
      this.selectionRevision=(this.selectionRevision??0)+1;
      if(p.data?.channel_id!==this.channel?.id){this.channel=null;this.members=[];this.update(p.data?.channel_id?'通話情報を更新しています':'通話への参加を待っています');}
    }
    if(['VOICE_CHANNEL_SELECT','VOICE_STATE_CREATE','VOICE_STATE_UPDATE','VOICE_STATE_DELETE'].includes(p.evt))this.refreshSafely('通話情報の取得に失敗しました。');
  }
  close(status='未接続',unexpected=false){
    this.epoch=(this.epoch??0)+1;this.refreshJob=null;this.subscribedChannel=null;
    this.cancelAuthorization?.();
    clearInterval(this.poll);this.poll=null;
    const s=this.socket;this.socket=null;if(s){s.removeAllListeners();s.on('error',()=>{});s.destroy();}
    if(this.ready){clearTimeout(this.ready.timer);this.ready.reject(Error('接続を終了しました。'));this.ready=null;}
    for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error('Discordが切断されました。'));}this.pending.clear();this.members=[];this.channel=null;this.update(status);if(unexpected)this.emit('disconnect');
  }
}
