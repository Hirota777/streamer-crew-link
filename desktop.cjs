const {app,BrowserWindow,dialog,Menu,safeStorage,shell}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const base=app.isPackaged?path.dirname(process.execPath):__dirname;
const data=process.env.STREAMER_CREW_LINK_PROFILE?path.resolve(process.env.STREAMER_CREW_LINK_PROFILE):path.join(app.getPath('appData'),'Streamer crew link');fs.mkdirSync(path.join(data,'desktop'),{recursive:true});app.setPath('userData',path.join(data,'desktop'));
// Upgrade the owner's previous installation locally; this directory is never
// used as a source for a distribution build.
const legacy=path.join(base,'data');
if(!process.env.STREAMER_CREW_LINK_PROFILE)for(const name of ['settings.json','discord-auth.bin']){const old=path.join(legacy,name),target=path.join(data,name);if(!fs.existsSync(target)&&fs.existsSync(old))fs.copyFileSync(old,target,fs.constants.COPYFILE_EXCL);}
// Chromium's async safeStorage key is held in the profile's Local State.
// Move that key together with an untouched legacy ciphertext, before ready.
// Never replace the key for credentials already created by this version.
const migrationMarker=path.join(data,'legacy-migration.json');
if(!process.env.STREAMER_CREW_LINK_PROFILE&&!fs.existsSync(migrationMarker)){
 const oldAuth=path.join(legacy,'discord-auth.bin'),newAuth=path.join(data,'discord-auth.bin'),oldState=path.join(legacy,'desktop','Local State'),newState=path.join(data,'desktop','Local State');
 if(fs.existsSync(oldAuth)&&fs.existsSync(newAuth)&&fs.existsSync(oldState)&&fs.readFileSync(oldAuth).equals(fs.readFileSync(newAuth))){
  if(fs.existsSync(newState)&&!fs.existsSync(newState+'.pre-upgrade'))fs.copyFileSync(newState,newState+'.pre-upgrade',fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(oldState,newState);
 }
}
let win,local,stopReader;const address='http://127.0.0.1:37891';
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  try{
   const {createApp}=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
   const {CredentialVault}=await import(pathToFileURL(path.join(__dirname,'lib','vault.mjs')).href);
   const credentialVault=new CredentialVault(data,{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:plain=>safeStorage.encryptStringAsync(plain),decrypt:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result});
   local=await createApp({directory:data,credentialVault,openExternal:url=>{const u=new URL(url);if(u.origin!=='https://discord.com'||u.pathname!=='/oauth2/authorize')throw Error('認証URLが不正です。');return shell.openExternal(url);}});
   if(!process.env.STREAMER_CREW_LINK_PROFILE&&local.snapshot().discord.auth.saved&&!fs.existsSync(migrationMarker))fs.writeFileSync(migrationMarker,JSON.stringify({schema:1,migrated:true}));
   await new Promise((resolve,reject)=>{local.server.once('error',reject);local.server.listen(37891,'127.0.0.1',resolve);});
   const {startReader}=await import(pathToFileURL(path.join(__dirname,'lib','reader.mjs')).href);
   stopReader=startReader(app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'reader','release'),local.ingestGame,local.setReaderStatus);
   Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'アプリ',submenu:[{label:'OBS表示を開く',click:()=>{const overlay=new BrowserWindow({width:1400,height:330,backgroundColor:'#101820',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});secure(overlay);overlay.loadURL(address+'/overlay');}},{type:'separator'},{label:'終了',role:'quit'}]},{label:'表示',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
   win=new BrowserWindow({width:1050,height:760,minWidth:780,minHeight:560,title:'Streamer crew link — Among Us 配信補助',backgroundColor:'#0b1018',show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
   secure(win);win.once('ready-to-show',()=>win.show());await win.loadURL(address);
   local.startDiscord().catch(()=>{});
  }catch(e){dialog.showErrorBox('CREW LINKを起動できません',e.code==='EADDRINUSE'?'以前の開発版が起動しています。以前のアプリを終了してから起動してください。':e.message);app.quit();}
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{stopReader?.();local?.shutdown();});
}
function secure(window){
 window.webContents.setWindowOpenHandler(({url})=>{if(url===address+'/overlay'){const overlay=new BrowserWindow({width:1400,height:330,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});secure(overlay);overlay.loadURL(url);}return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(address+'/'))event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
}
