import https from 'node:https';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';

export const releasePage='https://github.com/Hirota777/streamer-crew-link/releases/latest';
export const releaseApi='https://api.github.com/repos/Hirota777/streamer-crew-link/releases/latest';
export const upgradeCode='8FAFDAD1-280D-478C-A7ED-30FBEA4B5C72';
const prefix='/Hirota777/streamer-crew-link/releases/';
export function versionParts(value){
 // v1.00 was the public label for the internal MSI version 1.0.0.
 if(value==='v1.00')return [1,0,0];
 const match=/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value??'');
 if(!match)throw Error('リリースのバージョンを確認できません。');
 const parts=match.slice(1).map(Number);if(parts.some(v=>!Number.isSafeInteger(v)||v>65535))throw Error('バージョンの範囲が不正です。');return parts;
}
export function newer(a,b){const x=versionParts(a),y=versionParts(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
export function trustedAsset(value){
 const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='github.com'||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(prefix+'download/'))throw Error('更新ファイルの配布先が不正です。');return u.href;
}
export function parseRelease(r,current){
 if(!r||r.draft!==false||r.prerelease!==false||!Array.isArray(r.assets))throw Error('正式リリースを確認できません。');
 const parts=versionParts(r.tag_name),version=parts.join('.');
 if(!newer(version,current))return null;
 const page=new URL(r.html_url);if(page.origin!=='https://github.com'||page.username||page.password||page.search||page.hash||page.pathname!==prefix+'tag/'+r.tag_name)throw Error('リリースのURLが不正です。');
 const name=`Streamer-crew-link-${version}-Windows-x64.msi`,assets=r.assets.filter(a=>a?.name===name&&a.state==='uploaded');
 if(assets.length!==1)throw Error('更新用のWindows x64 MSIを特定できません。');
 const a=assets[0],url=trustedAsset(a.browser_download_url);
 if(new URL(url).pathname!==prefix+'download/'+r.tag_name+'/'+name)throw Error('更新ファイルとリリースが一致しません。');
 if(!Number.isSafeInteger(a.size)||a.size<1||a.size>1024**3||!/^sha256:[a-f\d]{64}$/i.test(a.digest??''))throw Error('更新ファイルのサイズ・SHA256を確認できません。');
 return {version,tag:r.tag_name,page:page.href,name,url,size:a.size,sha256:a.digest.slice(7).toLowerCase(),notes:String(r.body??'').slice(0,16000)};
}
function allowedDownload(u){return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='github.com'&&u.pathname.startsWith(prefix+'download/')||['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname));}
// No credentials, cookies or arbitrary hosts. Redirects are checked before each request.
export async function requestBytes(url,{signal,onChunk,maxBytes=2*1024**2,download=false}={},redirects=0){
 const u=new URL(url);if(download?!allowedDownload(u):u.href!==releaseApi)throw Error('接続先が不正です。');
 if(redirects>5)throw Error('更新先の転送回数が多すぎます。');
 return new Promise((resolve,reject)=>{
  const req=https.get(u,{signal,headers:{'User-Agent':'Streamer-crew-link-update','Accept':download?'application/octet-stream':'application/vnd.github+json','Accept-Encoding':'identity'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)&&download){res.resume();if(!res.headers.location){reject(Error('転送先がありません。'));return;}try{requestBytes(new URL(res.headers.location,u).href,{signal,onChunk,maxBytes,download},redirects+1).then(resolve,reject);}catch{reject(Error('転送先が不正です。'));}return;}
   if(res.statusCode!==200){res.resume();reject(Error(res.statusCode===403||res.statusCode===429?'GitHubの利用制限中です。時間をおいて確認してください。':'更新情報を取得できませんでした。'));return;}
   (async()=>{let size=0;const chunks=[];for await(const chunk of res){size+=chunk.length;if(size>maxBytes)throw Error('更新ファイルのサイズが上限を超えました。');if(onChunk)await onChunk(chunk);else chunks.push(chunk);}return onChunk?size:Buffer.concat(chunks);})().then(resolve,error=>{res.destroy();reject(error);});
  });req.setTimeout(15000,()=>req.destroy(Error('接続がタイムアウトしました。')));req.once('error',reject);
 });
}
export class Updates extends EventEmitter{
 constructor({directory,current,installed,request=requestBytes,downloadTimeoutMs=15*60*1000}){super();Object.assign(this,{directory,current,installed,request,downloadTimeoutMs});this.prefs={autoCheck:true,skipped:''};this.state={phase:'idle',message:'',release:null,received:0};this.busy=false;this.ready=null;this.writeQueue=Promise.resolve();}
 view(){return {...this.state,storageAvailable:!this.storageError,lastResult:this.lastResult??'',revision:this.revision??0,current:this.current,installed:this.installed,autoCheck:this.prefs.autoCheck};}
 change(patch){Object.assign(this.state,patch);this.revision=(this.revision??0)+1;this.emit('change',this.view());}
 async load(){
  try{await fs.mkdir(this.directory,{recursive:true});this.storageError=false;}catch{this.storageError=true;this.change({phase:'unavailable',message:'更新用の保存先を開けません。配信機能はそのまま使用できます。保存先を確認してから「更新を確認」を押してください。'});return this.view();}
  try{const p=JSON.parse(await fs.readFile(path.join(this.directory,'preferences.json'),'utf8'));this.prefs={autoCheck:p.autoCheck!==false,skipped:typeof p.skipped==='string'?p.skipped:''};}catch(e){if(e.code!=='ENOENT')this.change({message:'更新設定を読み込めませんでした。'});}
  try{const p=JSON.parse((await fs.readFile(path.join(this.directory,'last-result.json'),'utf8')).replace(/^\uFEFF/,''));if(['success','cancelled','error','reboot'].includes(p.status))this.lastResult=String(p.message??'').slice(0,300);await fs.unlink(path.join(this.directory,'last-result.json'));}catch{}
  try{const p=JSON.parse(await fs.readFile(path.join(this.directory,'prepared.json'),'utf8'));if(p.schema===1&&/^download-[a-f\d-]{36}$/.test(p.folder)&&p.name===`Streamer-crew-link-${versionParts(p.version).join('.')}-Windows-x64.msi`&&/^[a-f\d]{64}$/.test(p.sha256)&&Number.isSafeInteger(p.size)&&p.size>0&&newer(p.version,this.current))this.cached=p;}catch{}
  await this.cleanup().catch(()=>{});return this.view();}
 async prepared(release){
  const c=this.cached;if(!this.installed||!c||['name','version','size','sha256'].some(k=>c[k]!==release[k]))return null;
  try{
   const root=await fs.realpath(this.directory),folder=path.join(root,c.folder),file=path.join(folder,c.name);
   const dir=await fs.lstat(folder),stat=await fs.lstat(file);if(!dir.isDirectory()||dir.isSymbolicLink()||!stat.isFile()||stat.isSymbolicLink()||stat.size!==release.size||await fs.realpath(folder)!==folder)return null;
   const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==release.sha256)return null;
   return {folder,file,release};
  }catch{return null;}
 }
 async cleanup(){
  // Only old updater-owned UUID folders and known regular files; never follow a link or delete recursively.
  const root=await fs.realpath(this.directory);
  for(const entry of await fs.readdir(root,{withFileTypes:true})){
   if(!entry.isDirectory()||!/^download-[a-f\d-]{36}$/.test(entry.name)||entry.name===this.cached?.folder)continue;
   const folder=path.join(root,entry.name),stat=await fs.lstat(folder);if(stat.isSymbolicLink()||Date.now()-stat.mtimeMs<24*60*60*1000||await fs.realpath(folder)!==folder)continue;
   for(const f of await fs.readdir(folder,{withFileTypes:true})){if(f.isFile()&&/^(?:Streamer-crew-link-\d+\.\d+\.\d+-Windows-x64\.msi(?:\.part)?|(?:job|result)-[a-f\d-]{36}\.json|helper-[a-f\d-]{36}\.ps1|(?:started|ready|commit|cancel)-[a-f\d-]{36})$/.test(f.name))await fs.unlink(path.join(folder,f.name)).catch(()=>{});}
   await fs.rmdir(folder).catch(()=>{});
  }
 }
 async preferences(patch){const run=this.writeQueue.then(async()=>{const next={...this.prefs,...patch},tmp=path.join(this.directory,'preferences.json.tmp');await fs.writeFile(tmp,JSON.stringify(next));await fs.rename(tmp,path.join(this.directory,'preferences.json'));this.prefs=next;this.change({});});this.writeQueue=run.catch(()=>{});await run;return this.view();}
 async check(manual=false){
  if(this.storageError){if(manual)await this.load();if(this.storageError)return this.view();}
  if(this.busy||(!manual&&!this.prefs.autoCheck))return this.view();this.busy=true;this.change({phase:'checking',message:manual?'更新を確認しています…':'',release:null,received:0});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);timer.unref?.();
  try{const raw=await this.request(releaseApi,{signal:controller.signal});const release=parseRelease(JSON.parse(raw.toString('utf8')),this.current);this.ready=null;
   if(!release)this.change({phase:'current',message:manual?'最新版を使用しています。':'',release:null});
   else if(!manual&&this.prefs.skipped===release.version)this.change({phase:'idle',message:'',release:null});
   else{this.ready=await this.prepared(release);this.change({phase:this.ready?'ready':'available',received:this.ready?release.size:0,message:this.ready?'取得済みの更新を照合しました。インストールできます。':'変更内容を確認し、更新するか選んでください。',release});}
  }catch{this.change({phase:'error',message:manual?'更新を確認できませんでした。ネット接続を確認して、時間をおいてお試しください。':'',release:null});}
  finally{clearTimeout(timer);this.busy=false;}return this.view();
 }
 async skip(){if(this.busy)return this.view();if(this.state.release)await this.preferences({skipped:this.state.release.version});return this.later();}
 later(){if(!this.busy){this.lastResult='';this.change({phase:'idle',message:'',release:null});}return this.view();}
 cancel(){this.controller?.abort();return this.view();}
 async download(){
  if(this.busy||this.storageError||!this.installed||!this.state.release)return this.view();this.busy=true;this.ready=null;const release={...this.state.release};this.controller=new AbortController();const timer=setTimeout(()=>this.controller?.abort(new DOMException('Download timeout','TimeoutError')),this.downloadTimeoutMs);timer.unref?.();
  const folder=path.join(this.directory,'download-'+randomUUID()),file=path.join(folder,release.name);let handle;
  try{const cached=await this.prepared(release);this.controller.signal.throwIfAborted();if(cached){this.ready=cached;this.change({phase:'ready',received:release.size,message:'取得済みの更新を照合しました。インストールできます。'});return this.view();}await this.cleanup().catch(()=>{});await fs.mkdir(folder);handle=await fs.open(file+'.part','wx');const hash=createHash('sha256');let received=0,last=0;this.change({phase:'downloading',received:0,message:'更新をダウンロードしています…'});
   await this.request(release.url,{signal:this.controller.signal,download:true,maxBytes:release.size,onChunk:async chunk=>{await handle.writeFile(chunk);hash.update(chunk);received+=chunk.length;if(Date.now()-last>150){last=Date.now();this.change({received});}}});
   this.controller.signal.throwIfAborted();await handle.close();handle=null;if(received!==release.size||hash.digest('hex')!==release.sha256)throw Error('更新ファイルの照合に失敗しました。もう一度取得してください。');
   await fs.rename(file+'.part',file);this.ready={file,folder,release};this.cached={schema:1,folder:path.basename(folder),name:release.name,version:release.version,size:release.size,sha256:release.sha256};let persisted=true;
   try{const metadata=path.join(this.directory,'prepared.json');await fs.writeFile(metadata+'.tmp',JSON.stringify(this.cached));await fs.rename(metadata+'.tmp',metadata);}catch{persisted=false;}
   this.change({phase:'ready',received,message:'ダウンロードと照合が完了しました。'+(persisted?'':'次回起動用の保存に失敗しました。今回はインストールできます。')});
  }catch(e){if(handle)await handle.close().catch(()=>{});await fs.unlink(file+'.part').catch(()=>{});await fs.rmdir(folder).catch(()=>{});this.change({phase:'available',received:0,message:this.controller.signal.aborted?(this.controller.signal.reason?.name==='TimeoutError'?'ダウンロードが制限時間を超えました。通信状況を確認して再試行してください。':'ダウンロードを中止しました。'):String(e.message).slice(0,200)});}
  finally{clearTimeout(timer);this.controller=null;this.busy=false;}return this.view();
 }
}
