const {app,BrowserWindow,dialog,Menu,safeStorage,shell,ipcMain,clipboard,screen,session}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const base=app.isPackaged?path.dirname(process.execPath):__dirname;
const data=process.env.STREAMER_CREW_LINK_PROFILE?path.resolve(process.env.STREAMER_CREW_LINK_PROFILE):path.join(app.getPath('appData'),'Streamer crew link');fs.mkdirSync(path.join(data,'desktop'),{recursive:true});app.setPath('userData',path.join(data,'desktop'));
// Upgrade the owner's previous installation locally; this directory is never
// used as a source for a distribution build.
const legacy=path.join(base,'data');
const migrationMarker=path.join(data,'legacy-migration.json');
function removeLegacyCopies(includeAuth=false){for(const file of ['settings.json','settings.json.tmp',...(includeAuth?['discord-auth.bin','discord-auth.bin.tmp']:[])]){const old=path.resolve(legacy,file);if(path.dirname(old)!==path.resolve(legacy))throw Error('旧保存先が不正です。');if(fs.existsSync(old))fs.unlinkSync(old);}}
if(!process.env.STREAMER_CREW_LINK_PROFILE&&!fs.existsSync(migrationMarker))for(const name of ['settings.json','discord-auth.bin']){const old=path.join(legacy,name),target=path.join(data,name);if(!(name==='settings.json'&&fs.existsSync(path.join(data,'settings.bin')))&&!fs.existsSync(target)&&fs.existsSync(old))fs.copyFileSync(old,target,fs.constants.COPYFILE_EXCL);}
// Chromium's async safeStorage key is held in the profile's Local State.
// Move that key together with an untouched legacy ciphertext, before ready.
// Never replace the key for credentials already created by this version.

if(!process.env.STREAMER_CREW_LINK_PROFILE&&!fs.existsSync(migrationMarker)){
 const oldAuth=path.join(legacy,'discord-auth.bin'),newAuth=path.join(data,'discord-auth.bin'),oldState=path.join(legacy,'desktop','Local State'),newState=path.join(data,'desktop','Local State');
 if(fs.existsSync(oldAuth)&&fs.existsSync(newAuth)&&fs.existsSync(oldState)&&fs.readFileSync(oldAuth).equals(fs.readFileSync(newAuth))){
  if(fs.existsSync(newState)&&!fs.existsSync(newState+'.pre-upgrade'))fs.copyFileSync(newState,newState+'.pre-upgrade',fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(oldState,newState);
 }
}
let win,local,stopReader,quitting=false;const overlayWindows=new Set();const address='http://127.0.0.1:37891';
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  try{
   const {createApp}=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
   const {CredentialVault}=await import(pathToFileURL(path.join(__dirname,'lib','vault.mjs')).href);
   const settingsCipher={available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:plain=>safeStorage.encryptStringAsync(plain),decrypt:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result};
   const credentialVault=new CredentialVault(data,settingsCipher);
   local=await createApp({directory:data,credentialVault,settingsCipher,licenseDirectory:base,readerLicenseDirectory:app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'reader'),clearLegacyData:async()=>removeLegacyCopies(true),openExternal:url=>{const u=new URL(url);if(u.origin!=='https://discord.com'||u.pathname!=='/oauth2/authorize')throw Error('認証URLが不正です。');return shell.openExternal(url);}});
   // A verified encrypted settings file now exists. Remove only known legacy copies.
   if(!process.env.STREAMER_CREW_LINK_PROFILE)removeLegacyCopies(local.snapshot().discord.auth.saved);
   // The default session is only used for encryption keys, never to display API data.
   await session.defaultSession.clearCache();
   session.fromPartition('crew-link-runtime',{cache:false});
   if(!process.env.STREAMER_CREW_LINK_PROFILE&&!fs.existsSync(migrationMarker))fs.writeFileSync(migrationMarker,JSON.stringify({schema:1,migrated:true}));
   await new Promise((resolve,reject)=>{local.server.once('error',reject);local.server.listen(37891,'127.0.0.1',resolve);});
   const {startReader}=await import(pathToFileURL(path.join(__dirname,'lib','reader.mjs')).href);
   stopReader=startReader(app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'reader','release'),local.ingestGame,local.setReaderStatus);
   const updateMenu=await require('./lib/desktop-updates.cjs').setupUpdates({app,ipcMain,dialog,shell,Menu,data,base,address,getWindow:()=>win});
   Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'アプリ',submenu:[{label:'OBS表示を開く',click:()=>{openOverlay();}},{label:'ライセンス',click:()=>openLegal(address+'/licenses')},{type:'separator'},...updateMenu,{type:'separator'},{label:'終了',role:'quit'}]},{label:'表示',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
   ipcMain.handle('crew-link:copy-overlay-url',async event=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('コピーを実行できません。');
    await clipboard.writeText(address+'/overlay');
   });
   win=new BrowserWindow({width:780,height:930,minWidth:780,minHeight:560,title:'Streamer crew link — Among Us 配信補助',backgroundColor:'#0b1018',show:false,webPreferences:{partition:'crew-link-runtime',preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
   win.once('closed',()=>{win=null;if(!quitting)app.quit();});
   secure(win);win.webContents.on('will-prevent-unload',()=>{quitting=false;});win.once('ready-to-show',()=>win.show());await win.loadURL(address);
   local.startDiscord().catch(()=>{});
  }catch(e){dialog.showErrorBox('CREW LINKを起動できません',e.code==='EADDRINUSE'?'以前の開発版が起動しています。以前のアプリを終了してから起動してください。':e.message);app.quit();}
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{quitting=true;});
 // beforeunload can still cancel before-quit. Keep the server/reader alive until every window has closed.
 app.on('will-quit',()=>{stopReader?.();local?.shutdown();});
}
const publicLinks=new Set(['https://github.com/Hirota777/streamer-crew-link/blob/main/PRIVACY.md','https://github.com/Hirota777/streamer-crew-link/blob/main/TERMS.md','https://github.com/Hirota777/streamer-crew-link/issues']);
function secure(window){
 window.webContents.setWindowOpenHandler(({url})=>{if(url===address+'/overlay'){openOverlay();}else if(legalPaths.has(new URL(url).pathname)&&new URL(url).origin===address){openLegal(url);}else if(publicLinks.has(url)){shell.openExternal(url).catch(()=>{});}return {action:'deny'};});
 window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(address+'/'))event.preventDefault();});
 window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
}

function openOverlay(){
 const vertical=local?.snapshot().preset.settings.orientation==='vertical';
 const area=screen.getPrimaryDisplay().workAreaSize;
 const overlay=new BrowserWindow({width:Math.min(vertical?430:1400,area.width-40),height:vertical?Math.min(1100,area.height-60):330,backgroundColor:'#101820',webPreferences:{partition:'crew-link-runtime',nodeIntegration:false,contextIsolation:true,sandbox:true}});
 overlayWindows.add(overlay);overlay.once('closed',()=>overlayWindows.delete(overlay));
 secure(overlay);overlay.loadURL(address+'/overlay?preview=1');
}

const legalPaths=new Set(['/licenses','/legal/application','/legal/notices','/legal/electron','/legal/chromium','/legal/reader','/legal/dotnet','/legal/dotnet-third-party','/legal/capture','/legal/assets','/legal/ffmpeg-source']);
function openLegal(url){
 const original=new URL(url).pathname.startsWith('/legal/');
 const legal=new BrowserWindow({width:800,height:720,title:'ライセンス — Streamer crew link',backgroundColor:original?'#ffffff':'#10151b',webPreferences:{partition:'crew-link-runtime',nodeIntegration:false,contextIsolation:true,sandbox:true}});
 secure(legal);
 // Plain-text documents otherwise inherit the window's dark background with black text.
 legal.webContents.on('did-finish-load',()=>{
  if(new URL(legal.webContents.getURL()).pathname.startsWith('/legal/'))legal.webContents.insertCSS('html,body{color-scheme:light!important;background:#fff!important;color:#171717!important}body{margin:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.65}a{color:#0645ad!important}a:visited{color:#663399!important}').catch(()=>{});
 });
 legal.loadURL(url);
}
