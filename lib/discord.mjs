import net from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export function frame(op, data) {const payload=Buffer.from(JSON.stringify(data));const h=Buffer.alloc(8);h.writeUInt32LE(op);h.writeUInt32LE(payload.length,4);return Buffer.concat([h,payload]);}
export class Decoder {
  buffer=Buffer.alloc(0);
  push(chunk){this.buffer=Buffer.concat([this.buffer,chunk]);const frames=[];while(this.buffer.length>=8){const size=this.buffer.readUInt32LE(4);if(size>4*1024*1024)throw Error('Discord応答が大きすぎます。');if(this.buffer.length<8+size)break;frames.push({op:this.buffer.readUInt32LE(0),data:JSON.parse(this.buffer.subarray(8,8+size).toString())});this.buffer=this.buffer.subarray(8+size);}return frames;}
}
export class Discord extends EventEmitter {
  constructor({fetcher=fetch,now=Date.now,authorize,cancelAuthorization}={}){super();this.pending=new Map();this.socket=null;this.channel=null;this.members=[];this.status='未接続';Object.assign(this,{fetcher,now,authorize,cancelAuthorization});}
  update(status){this.status=status;this.emit('change');}
  async open(clientId){
    for(let n=0;n<10;n++){
      try {this.socket=await new Promise((resolve,reject)=>{const s=net.createConnection('\\\\?\\pipe\\discord-ipc-'+n);const timer=setTimeout(()=>s.destroy(Error('接続タイムアウト')),1500);s.once('error',reject);s.once('connect',()=>{clearTimeout(timer);s.removeListener('error',reject);resolve(s);});s.once('close',()=>clearTimeout(timer));});break;}catch{}
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
      if(p.nonce&&this.pending.has(p.nonce)){const job=this.pending.get(p.nonce);this.pending.delete(p.nonce);clearTimeout(job.timer);if(p.evt==='ERROR'){const e=Error('Discordが認証または情報の取得を拒否しました。アプリのRPC利用条件を確認してください。');e.authRequired=true;job.reject(e);}else job.resolve(p.data);}
      if(p.cmd==='DISPATCH')this.dispatch(p);
    }}catch{this.close('Discordの応答を読み取れませんでした。',true);}});
    this.socket.write(frame(0,{v:1,client_id:clientId}));await ready;
  }
  call(cmd,args={},evt){return new Promise((resolve,reject)=>{if(!this.socket)return reject(Error('Discordが未接続です。'));const nonce=randomUUID();const timer=setTimeout(()=>{this.pending.delete(nonce);reject(Error('Discordの応答がタイムアウトしました。'));},60000);this.pending.set(nonce,{resolve,reject,timer});this.socket.write(frame(1,{cmd,args,nonce,...(evt?{evt}:{})}));});}
  async exchange(credentials,parameters,oldTokens){
    let response;
    try{response=await this.fetcher('https://discord.com/api/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:credentials.clientId,...parameters}),signal:AbortSignal.timeout(15000)});}catch{throw Error('Discordの認証サーバーへ接続できません。');}
    if(!response.ok){const e=Error(response.status>=500||response.status===429?'Discordの認証サーバーへの接続を待っています。':'Discordの認証が無効になっています。初回連携をやり直してください。');e.authRequired=response.status===400||response.status===401||response.status===403;throw e;}
    let token;try{token=await response.json();}catch{throw Error('Discordの認証応答を確認できませんでした。');}
    if(typeof token.access_token!=='string'||!Number.isFinite(token.expires_in)||token.expires_in<=0)throw Error('Discordの認証応答を確認できませんでした。');
    return {accessToken:token.access_token,refreshToken:token.refresh_token||oldTokens?.refreshToken||'',expiresAt:this.now()+token.expires_in*1000};
  }
  async connect({clientId,redirectUri,channelId,tokens,interactive=true,onToken=async()=>{}}){
    this.close('接続準備中');
    if(!/^\d{15,22}$/.test(clientId??''))throw Error('Discord Application IDを確認してください。');
    if(channelId&&!/^\d{15,22}$/.test(channelId))throw Error('チャンネルIDを確認してください。');
    try {
      this.update(interactive?'Discordの許可画面を確認してください':'保存済みの認証で自動接続しています');await this.open(clientId);
      if(interactive){
        if(!this.authorize)throw Error('Discord連携はデスクトップアプリから実行してください。');
        const {code,verifier}=await this.authorize();
        tokens=await this.exchange({clientId},{grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier});
        await onToken(tokens);
      }else if(!tokens||tokens.expiresAt<=this.now()+60000){
        if(!tokens?.refreshToken){const e=Error('初回のDiscord連携が必要です。');e.authRequired=true;throw e;}
        tokens=await this.exchange({clientId},{grant_type:'refresh_token',refresh_token:tokens.refreshToken},tokens);
        // Persist rotated refresh tokens immediately; do not lose them if the
        // subsequent local IPC authentication is interrupted.
        await onToken(tokens);
      }
      await this.call('AUTHENTICATE',{access_token:tokens.accessToken});
      this.targetId=channelId||null;
      await this.call('SUBSCRIBE',{},'VOICE_CHANNEL_SELECT');await this.refresh();this.update(this.channel?'接続中':'通話への参加を待っています');
      this.poll=setInterval(()=>this.refresh().catch(()=>this.close('Discord情報の更新に失敗しました。',true)),10000);
    }catch(e){this.close('接続失敗：'+e.message);throw e;}
  }
  async refresh(){
    if(this.refreshing)return;this.refreshing=true;
    try {
      let c=await this.call(this.targetId?'GET_CHANNEL':'GET_SELECTED_VOICE_CHANNEL',this.targetId?{channel_id:this.targetId}:{});
      if(c&&!c.guild_id)c=null;
      const old=this.channel;
      if(old?.id!==c?.id){
        for(const evt of ['SPEAKING_START','SPEAKING_STOP','VOICE_STATE_CREATE','VOICE_STATE_UPDATE','VOICE_STATE_DELETE']){
          if(old)await this.call('UNSUBSCRIBE',{channel_id:old.id},evt);
          if(c)await this.call('SUBSCRIBE',{channel_id:c.id},evt);
        }
      }
      this.channel=c;
      this.members=(c?.voice_states??[]).map(v=>({id:v.user.id,name:v.nick||v.user.global_name||v.user.username,avatar:v.user.avatar?`https://cdn.discordapp.com/avatars/${v.user.id}/${v.user.avatar}.png?size=128`:null,speaking:old?.id===c.id&&(this.members.find(m=>m.id===v.user.id)?.speaking??false)}));
      this.update(c?'接続中':'通話への参加を待っています');
    }finally{this.refreshing=false;}
  }
  dispatch(p){
    if(['SPEAKING_START','SPEAKING_STOP'].includes(p.evt)){
      if(p.data?.channel_id&&p.data.channel_id!==this.channel?.id)return;
      const m=this.members.find(m=>m.id===p.data?.user_id);if(m){m.speaking=p.evt==='SPEAKING_START';this.emit('change');}
    }
    if(['VOICE_CHANNEL_SELECT','VOICE_STATE_CREATE','VOICE_STATE_UPDATE','VOICE_STATE_DELETE'].includes(p.evt))this.refresh().catch(()=>this.close('通話情報の取得に失敗しました。',true));
  }
  close(status='未接続',unexpected=false){
    this.cancelAuthorization?.();
    clearInterval(this.poll);this.poll=null;
    const s=this.socket;this.socket=null;if(s){s.removeAllListeners();s.on('error',()=>{});s.destroy();}
    if(this.ready){clearTimeout(this.ready.timer);this.ready.reject(Error('接続を終了しました。'));this.ready=null;}
    for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(Error('Discordが切断されました。'));}this.pending.clear();this.members=[];this.channel=null;this.update(status);if(unexpected)this.emit('disconnect');
  }
}
