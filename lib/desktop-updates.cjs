const fs=require('node:fs/promises');const path=require('node:path');const {spawn}=require('node:child_process');const {pathToFileURL}=require('node:url');const {randomUUID}=require('node:crypto');

// Only the trusted main window can invoke these fixed actions; no paths or URLs come from the renderer.
exports.setupUpdates=async function({app,ipcMain,dialog,shell,Menu,data,base,address,getWindow,onInstall,updatesModule,spawnHelper=spawn}){
 const {Updates,releasePage}=updatesModule??await import(pathToFileURL(path.join(__dirname,'updates.mjs')).href);
 const expected=path.join(process.env.LOCALAPPDATA??'','Programs','Streamer crew link');
 const installed=app.isPackaged&&!process.env.STREAMER_CREW_LINK_PROFILE&&path.resolve(base).toLowerCase()===path.resolve(expected).toLowerCase();
 const updates=new Updates({directory:path.join(data,'updates'),current:app.getVersion(),installed});await updates.load();
 let installing=false;
 function send(){const win=getWindow();if(win&&!win.isDestroyed()){win.webContents.send('crew-link:update-state',updates.view());win.setProgressBar(updates.state.phase==='downloading'?updates.state.received/updates.state.release.size:-1);}const item=Menu?.getApplicationMenu()?.getMenuItemById('update-autocheck');if(item)item.checked=updates.prefs.autoCheck;}
 updates.on('change',send);
 async function install(){
  if(installing||updates.busy||!updates.ready||!installed)return updates.view();
  const win=getWindow();installing=true;
  try{
   const choice=await dialog.showMessageBox(win,{type:'question',title:'更新のインストール',message:'アプリを終了して更新しますか？',detail:'更新中はOBS表示が一時停止します。Among UsとDiscordは終了しません。設定・対応づけ・保存認証を引き継ぎます。',buttons:['終了して更新','あとで'],defaultId:1,cancelId:1,noLink:true});
   if(choice.response!==0)return updates.view();
   // Ask again after the native confirmation; edits may have changed while it was open.
   const clean=await win.webContents.executeJavaScript('window.crewLinkCanInstallUpdate?.() === true');
   if(!clean){await dialog.showMessageBox(win,{type:'info',message:'未保存の編集があります。',detail:'編集したプリセットを保存するか、変更を元に戻してから更新してください。',buttons:['アプリに戻る']});return updates.view();}
   const {file,folder,release}=updates.ready,attempt=randomUUID(),ready=path.join(folder,'ready-'+attempt),commit=path.join(folder,'commit-'+attempt),cancel=path.join(folder,'cancel-'+attempt),result=path.join(folder,'result-'+attempt+'.json'),job=path.join(folder,'job-'+attempt+'.json');
   const info={msi:file,exe:process.execPath,pid:process.pid,version:release.version,sha256:release.sha256,ready,commit,cancel,result,lastResult:path.join(updates.directory,'last-result.json')};
   await fs.writeFile(job,'\uFEFF'+JSON.stringify(info));
   const script=await fs.readFile(path.join(__dirname,'install-update.ps1'),'utf8');
   const command=`& {\n${script}\n} -Job '${job.replaceAll("'","''")}'`;
   const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
   const child=spawnHelper(ps,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,detached:true,stdio:'ignore'});
   let error;child.once('error',e=>error=e);child.unref();
   let prepared=false;
   for(let i=0;i<150;i++){if(error)throw error;try{await fs.access(ready);prepared=true;break;}catch{}try{const failed=JSON.parse((await fs.readFile(result,'utf8')).replace(/^\uFEFF/,''));if(failed.status==='error')throw Error(failed.message);}catch(e){if(e.code!=='ENOENT'&&!(e instanceof SyntaxError))throw e;}await new Promise(r=>setTimeout(r,100));}
   if(!prepared){await fs.writeFile(cancel,'cancel');throw Error('更新の準備が完了しませんでした。現在のアプリは終了していません。');}
   const cleanAgain=await win.webContents.executeJavaScript('window.crewLinkCanInstallUpdate?.() === true');if(!cleanAgain){await fs.writeFile(cancel,'cancel');throw Error('未保存の編集があります。保存してから更新してください。');}
   await fs.writeFile(commit,'exit-authorized');onInstall();app.quit();
  }catch(e){updates.change({message:'更新を開始できませんでした。'+String(e.message).slice(0,160)});}
  finally{installing=false;}return updates.view();
 }
 ipcMain.handle('crew-link:update',async(event,action,value)=>{
  const win=getWindow();if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('更新操作を実行できません。');
  if(action==='status')return updates.view();if(action==='check')return updates.check(true);
  if(action==='preference'&&typeof value==='boolean'){await updates.preferences({autoCheck:value});return updates.view();}
  if(action==='later')return updates.later();if(action==='skip')return updates.skip();
  if(action==='download')return updates.download();if(action==='cancel')return updates.cancel();if(action==='install')return install();
  if(action==='release'){await shell.openExternal(releasePage);return updates.view();}throw Error('更新操作が不正です。');
 });
 const timer=setTimeout(()=>updates.check(false),1800);timer.unref();
 app.on('before-quit',()=>{clearTimeout(timer);updates.cancel();});
 return [{label:'更新を確認',click:()=>updates.check(true)},{id:'update-autocheck',label:'起動時に更新を確認',type:'checkbox',checked:updates.prefs.autoCheck,click:item=>updates.preferences({autoCheck:item.checked}).catch(()=>updates.change({message:'更新設定を保存できませんでした。'}))}];
};
