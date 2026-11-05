import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {SCOPES} from './application.mjs';
export function pkce(){const verifier=randomBytes(32).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};}
export class OAuthFlow {
 constructor({application,openExternal,timeoutMs=180000}){Object.assign(this,{application,openExternal,timeoutMs});this.pending=null;}
 async begin(){
  if(!this.openExternal)throw Error('Discord連携はデスクトップアプリから実行してください。');
  this.cancel();const proof=pkce(),state=randomBytes(32).toString('base64url');
  const url=new URL('https://discord.com/oauth2/authorize');
  url.search=new URLSearchParams({client_id:this.application.clientId,response_type:'code',redirect_uri:this.application.redirectUri,scope:SCOPES.join(' '),state,code_challenge:proof.challenge,code_challenge_method:'S256',prompt:'consent'}).toString();
  let resolve,reject;const result=new Promise((ok,fail)=>{resolve=ok;reject=fail;});result.catch(()=>{});
  const timer=setTimeout(()=>this.cancel('Discordの許可待ちがタイムアウトしました。もう一度連携してください。'),this.timeoutMs);timer.unref?.();
  this.pending={resolve,reject,timer,state,verifier:proof.verifier};
  try{await this.openExternal(url.href);}catch{this.cancel('ブラウザーを開けませんでした。既定のブラウザーを確認してください。');}
  return result;
 }
 callback(url){
  const p=this.pending;if(!p)return {status:409};
  const states=url.searchParams.getAll('state'),state=states[0]??'';
  if(states.length!==1||Buffer.byteLength(state)!==Buffer.byteLength(p.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(p.state)))return {status:400};
  const codes=url.searchParams.getAll('code');
  if(!url.searchParams.has('error')&&(codes.length!==1||!codes[0]||codes[0].length>2048))return {status:400};
  this.pending=null;clearTimeout(p.timer);
  if(url.searchParams.has('error')){const e=Error('Discordの許可がキャンセルされました。');e.authRequired=true;p.reject(e);}else p.resolve({code:codes[0],verifier:p.verifier});
  return {status:303};
 }
 cancel(message='Discordの接続をキャンセルしました。'){const p=this.pending;this.pending=null;if(p){clearTimeout(p.timer);const e=Error(message);e.retryable=false;p.reject(e);}}
}
