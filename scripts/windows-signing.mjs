import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const execute=promisify(execFile);
export function signingConfig(env=process.env){
 const thumbprint=(env.CREW_LINK_SIGN_CERT_SHA1??'').replace(/\s/g,'').toUpperCase();
 if(!/^[A-F0-9]{40}$/.test(thumbprint))throw Error('コード署名証明書を先に取得し、CREW_LINK_SIGN_CERT_SHA1に証明書の拇印を設定してください。');
 const store=env.CREW_LINK_SIGN_STORE??'CurrentUser';if(!['CurrentUser','LocalMachine'].includes(store))throw Error('署名証明書ストアが不正です。');
 const timestampUrl=env.CREW_LINK_TIMESTAMP_URL??'http://timestamp.digicert.com';let url;try{url=new URL(timestampUrl)}catch{throw Error('タイムスタンプURLが不正です。')};if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('タイムスタンプURLが不正です。');
 return {thumbprint,store,timestampUrl,tool:env.CREW_LINK_SIGNTOOL_PATH??null};
}
export function signArguments(file,config){return ['sign','/s','My',...(config.store==='LocalMachine'?['/sm']:[]),'/sha1',config.thumbprint,'/fd','SHA256','/tr',config.timestampUrl,'/td','SHA256','/d','Streamer crew link',file];}
export async function prepareSigning({env=process.env,platform=process.platform,run=execute,exists=access}={}){
 if(platform!=='win32')throw Error('コード署名はWindows上で実行してください。');const config=signingConfig(env);
 if(!config.tool){
  const programFiles=env['ProgramFiles(x86)']??'C:\\Program Files (x86)';
  const {readdir}=await import('node:fs/promises');const base=path.join(programFiles,'Windows Kits','10','bin');let versions=[];try{versions=(await readdir(base)).filter(v=>/^10\.0\.\d+\.0$/.test(v)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch{}
  for(const version of versions){const candidate=path.join(base,version,'x64','signtool.exe');try{await exists(candidate);config.tool=candidate;break;}catch{}}
 }
 if(!config.tool)throw Error('Windows SDKのSignToolが必要です。CREW_LINK_SIGNTOOL_PATHで指定できます。');await exists(config.tool);
 // Certificate identity is validated locally. No PFX/password is passed on a command line.
 const script=`$ErrorActionPreference='Stop';$c=Get-Item -LiteralPath 'Cert:\\${config.store}\\My\\${config.thumbprint}';if(!$c.HasPrivateKey -or $c.NotAfter -le (Get-Date) -or $c.NotBefore -gt (Get-Date)){throw 'Certificate unavailable or expired'};if($c.Subject -eq $c.Issuer){throw 'Self-signed certificate is not accepted for public distribution'};$chain=[Security.Cryptography.X509Certificates.X509Chain]::new();$chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'));try{if(!$chain.Build($c)){throw 'Certificate chain is not trusted for code signing'}}finally{$chain.Dispose()}`;
 try{await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:60000});}catch{throw Error('指定したコード署名証明書を利用できません。秘密鍵・有効期限・配布用の信頼された証明書チェーンを確認してください。');}
 return config;
}
export async function signPackage(directory,config,{run=execute,exists=access}={}){
 const root=path.resolve(directory);const files=['Streamer crew link.exe',path.join('resources','reader','CrewLink.Reader.exe')].map(f=>path.join(root,f));
 // Check every input before signing any file; never sign or replace vendor DLLs.
 for(const file of files)await exists(file);
 const reportFile=path.join(root,'CODE-SIGNATURES.json');await rm(reportFile,{force:true});const verified=[];
 for(const file of files){
  await run(config.tool,signArguments(file,config),{windowsHide:true,timeout:120000});
  await run(config.tool,['verify','/pa','/all','/tw',file],{windowsHide:true,timeout:120000});
  verified.push({file:path.relative(root,file).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(file)).digest('hex'),verified:true});
 }
 await writeFile(reportFile,JSON.stringify({schema:1,thumbprint:config.thumbprint,timestampUrl:config.timestampUrl,files:verified},null,2)+'\n');
 return verified;
}
