import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
const epoch='1.1';
const markerName='fresh-start-1.1.json';
const roots=['Streamer crew link','Streamer crew link Streamkit Dev'];
const plainFiles=['settings.bin','settings.json','discord-auth.bin','legacy-migration.json'];
const files=[...plainFiles,...plainFiles.map(n=>n+'.tmp'),...['settings.bin','settings.json'].flatMap(n=>[1,2,3].flatMap(i=>[`${n}.backup-${i}`,`${n}.backup-${i}.tmp`]))];
async function exists(file){try{return await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const equal=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
async function validateRoot(root,anchor){const s=await exists(root);if(!s)return;if(s.isSymbolicLink())throw Error('リンクされた旧設定は自動削除できません。');if(!s.isDirectory()||!equal(await fs.realpath(root),root)||path.dirname(root)!==anchor)throw Error('旧設定の保存先を安全に確認できません。');}
async function validateTarget(target,root){const rel=path.relative(root,target);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('旧設定の削除先が不正です。');const s=await exists(target);if(!s)return false;if(s.isSymbolicLink()||!equal(await fs.realpath(target),target))throw Error('リンクされた旧設定は自動削除できません。');if(s.isDirectory())for(const name of await fs.readdir(target))await validateTarget(path.join(target,name),root);else if(!s.isFile())throw Error('旧設定に不明なファイル形式があります。');return true;}
export async function assertLegacyAppsStopped(){for(const port of [37891,37901])await new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',()=>reject(Error('以前のStreamer crew linkを終了してから、新しいアプリを起動してください。')));server.listen(port,'127.0.0.1',()=>server.close(error=>error?reject(error):resolve()));});}
// Only known app-owned files are cleared. Never import/decrypt old settings.
// A stable epoch marker protects all settings created after this first launch.
export async function prepareFreshRelease(appData,{checkIdle=assertLegacyAppsStopped,confirmReset=async()=>false,legacyInstallDirectory=null}={}){
 const anchor=await fs.realpath(appData),directories=roots.map(name=>path.join(anchor,name));
 await validateRoot(directories[0],anchor);
 const marker=path.join(directories[0],markerName);
 if(await exists(marker)){await validateTarget(marker,directories[0]);let saved;try{saved=JSON.parse(await fs.readFile(marker,'utf8'));}catch{throw Error('初期化の完了記録を確認できません。設定は削除していません。');}if(saved.schema!==1||saved.epoch!==epoch)throw Error('初期化の完了記録が不正です。設定は削除していません。');return false;}
 await checkIdle();
 const scopes=directories.map(root=>({root,anchor}));
 if(legacyInstallDirectory){const install=path.resolve(legacyInstallDirectory),s=await exists(install);if(!s||!s.isDirectory()||s.isSymbolicLink()||!equal(path.basename(install),'Streamer crew link')||!equal(await fs.realpath(install),install))throw Error('旧インストール先を安全に確認できません。');scopes.push({root:path.join(install,'data'),anchor:install});}
 for(const scope of scopes)await validateRoot(scope.root,scope.anchor);
 const plan=[];
 if(await exists(marker+'.tmp')){if(!await validateTarget(marker+'.tmp',directories[0])||(await fs.lstat(marker+'.tmp')).isDirectory())throw Error('初期化の一時ファイルが不正です。');plan.push({root:directories[0],target:marker+'.tmp'});}
 const addFile=async(root,target)=>{if(await validateTarget(target,root)){if(!(await fs.lstat(target)).isFile())throw Error('旧設定が通常のファイルではありません。');plan.push({root,target});}};
 for(const {root}of scopes){
  for(const name of files)await addFile(root,path.join(root,name));
  for(const name of ['updates','obs-streamkit']){
   const folder=path.join(root,name);await validateRoot(folder,root);if(!await exists(folder))continue;
   const names=name==='updates'?['preferences.json','preferences.json.tmp','prepared.json','prepared.json.tmp','last-result.json']:['streamer-crew-link.lua','streamkit-style.json','streamkit-style.json.tmp','streamkit-status.json','streamkit-status.json.tmp'];
   for(const file of names)await addFile(folder,path.join(folder,file));
   if(name==='updates')for(const entry of await fs.readdir(folder)){if(!/^download-[a-f\d-]{36}$/.test(entry))continue;const download=path.join(folder,entry);await validateRoot(download,folder);for(const file of await fs.readdir(download)){if(/^(?:Streamer-crew-link-\d+\.\d+\.\d+-Windows-x64\.msi(?:\.part)?|(?:job|result)-[a-f\d-]{36}\.json|helper-[a-f\d-]{36}\.ps1|(?:started|ready|commit|cancel)-[a-f\d-]{36})$/.test(file))await addFile(download,path.join(download,file));}}
  }
 }
 if(plan.length&&!await confirmReset())throw Object.assign(Error('旧設定の削除を中止しました。'),{code:'FRESH_RESET_CANCELLED'});
 // Validate the whole plan first, so an invalid target cannot cause a partial reset.
 for(const {root,target}of plan){await validateRoot(root,path.dirname(root));if(await validateTarget(target,root)){if(!(await fs.lstat(target)).isFile())throw Error('削除対象が通常ファイルではなくなりました。');await fs.unlink(target);}}
 await fs.mkdir(directories[0],{recursive:true});await fs.writeFile(marker+'.tmp',JSON.stringify({schema:1,epoch}),{mode:0o600,flag:'wx'});await fs.rename(marker+'.tmp',marker);return true;
}
