const {app,BrowserWindow,dialog,Menu,safeStorage,shell,ipcMain,clipboard,screen,session,nativeImage}=require('electron');
const path=require('node:path');const fs=require('node:fs');const {pathToFileURL}=require('node:url');
const base=app.isPackaged?path.dirname(process.execPath):__dirname;
const productName='Streamer crew link';app.setName(productName);
const data=process.env.STREAMER_CREW_LINK_PROFILE?path.resolve(process.env.STREAMER_CREW_LINK_PROFILE):path.join(app.getPath('appData'),productName);
fs.mkdirSync(path.join(data,'desktop'),{recursive:true});app.setPath('userData',path.join(data,'desktop'));
let win,local,stopReader,quitting=false;const overlayWindows=new Set();const address='http://127.0.0.1:37891';
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
 app.whenReady().then(async()=>{
  try{
   if(!app.isPackaged&&!process.env.STREAMER_CREW_LINK_PROFILE)throw Error('開発実行には専用のSTREAMER_CREW_LINK_PROFILEを指定してください。');
   let fresh=false;if(app.isPackaged&&!process.env.STREAMER_CREW_LINK_PROFILE){const {prepareFreshRelease}=await import(pathToFileURL(path.join(__dirname,'lib','fresh-release.mjs')).href);fresh=await prepareFreshRelease(app.getPath('appData'),{legacyInstallDirectory:path.resolve(base).toLowerCase()===path.resolve(process.env.LOCALAPPDATA??'','Programs',productName).toLowerCase()?base:null,confirmReset:async()=>{const choice=await dialog.showMessageBox({type:'warning',title:'初期状態で開始',message:'この版は以前の設定を引き継ぎません。',detail:'旧公開版とStreamkit検証版の設定・対応づけ・URL登録・保存認証・更新キャッシュ・連携出力を削除します。OBSのシーンや、このアプリ以外のファイルは削除しません。',buttons:['削除して開始','終了'],defaultId:1,cancelId:1,noLink:true});return choice.response===0;}});}
   const {createApp}=await import(pathToFileURL(path.join(__dirname,'server.mjs')).href);
   const settingsCipher={available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:plain=>safeStorage.encryptStringAsync(plain),decrypt:async bytes=>(await safeStorage.decryptStringAsync(bytes)).result};
   const {createNativeSpriteEncoder}=await import(pathToFileURL(path.join(__dirname,'lib','obs-style.mjs')).href);
   local=await createApp({spriteEncoder:createNativeSpriteEncoder(nativeImage),directory:data,port:37891,settingsCipher,licenseDirectory:base,readerLicenseDirectory:app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'reader')});
   // The default session is only used for encryption keys, never to display API data.
   await session.defaultSession.clearCache();
   const runtimeSession=session.fromPartition('crew-link-runtime',{cache:false});if(fresh){await session.defaultSession.clearStorageData();await runtimeSession.clearStorageData();}
   await new Promise((resolve,reject)=>{local.server.once('error',reject);local.server.listen(37891,'127.0.0.1',resolve);});
   const {startReader}=await import(pathToFileURL(path.join(__dirname,'lib','reader.mjs')).href);
   stopReader=startReader(app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'reader','release'),local.ingestGame,local.setReaderStatus);
   const updateMenu=await require('./lib/desktop-updates.cjs').setupUpdates({app,ipcMain,dialog,shell,Menu,data,base,address,getWindow:()=>win});
   Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'アプリ',submenu:[{label:'クルーのみ表示を別画面で開く',click:()=>openOverlay()},{label:'ライセンス',click:()=>openLegal(address+'/licenses')},{type:'separator'},...updateMenu,{type:'separator'},{label:'終了',role:'quit'}]},{label:'表示',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'}]}]));
   ipcMain.handle('crew-link:copy-overlay-url',async event=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('コピーを実行できません。');
    await clipboard.writeText(address+'/overlay');
   });
   const {cleanStreamkitUrl}=await import(pathToFileURL(path.join(__dirname,'public','streamkit.js')).href);
   ipcMain.handle('crew-link:copy-streamkit-url',async event=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('コピーを実行できません。');
    const url=cleanStreamkitUrl(local.snapshot().preset.streamkitUrl);if(!url)throw Error('保存済みのStreamkit URLがありません。');clipboard.writeText(url);
   });
   ipcMain.handle('crew-link:open-obs-folder',async event=>{
    if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('フォルダーを開けません。');
    if(!fs.existsSync(path.join(local.obsExport.directory,'streamer-crew-link.lua')))throw Error('先にOBS連携を開始してください。');
    const error=await shell.openPath(local.obsExport.directory);if(error)throw Error('フォルダーを開けません。');
   });
   function trustedMain(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||new URL(event.senderFrame.url).origin!==address||new URL(event.senderFrame.url).pathname!=='/')throw Error('この画面では操作できません。');}
   ipcMain.handle('crew-link:copy-obs-script',event=>{trustedMain(event);const file=path.join(local.obsExport.directory,'streamer-crew-link.lua');if(!fs.existsSync(file))throw Error('先にOBS連携を開始してください。');clipboard.writeText(file);});
   ipcMain.handle('crew-link:export-preset',async(event,body)=>{trustedMain(event);const value=local.store.exportPreset(body?.kind,body?.id);const name=value.preset.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,60);const result=await dialog.showSaveDialog(win,{title:'プリセットを書き出し',defaultPath:path.join(app.getPath('documents'),'Streamer-crew-link-'+name+'.json'),filters:[{name:'JSON',extensions:['json']}]});if(result.canceled||!result.filePath)return false;await fs.promises.writeFile(result.filePath,JSON.stringify(value,null,2),'utf8');return true;});
   win=new BrowserWindow({width:780,height:930,minWidth:780,minHeight:560,title:'Streamer crew link — Among Us 配信補助',backgroundColor:'#0b1018',show:false,webPreferences:{partition:'crew-link-runtime',preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
   win.once('closed',()=>{win=null;if(!quitting)app.quit();});
   secure(win);win.webContents.on('will-prevent-unload',()=>{quitting=false;});win.once('ready-to-show',()=>win.show());await win.loadURL(address);
  }catch(e){if(e.code!=='FRESH_RESET_CANCELLED')dialog.showErrorBox('CREW LINKを起動できません',e.code==='EADDRINUSE'?'すでに起動しているアプリを終了してから、起動し直してください。':e.message);app.quit();}
 });
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{quitting=true;});
 // beforeunload can still cancel before-quit. Keep the server/reader alive until every window has closed.
 app.on('will-quit',()=>{stopReader?.();local?.shutdown();});
}
const publicLinks=new Set(['https://github.com/Hirota777/streamer-crew-link/blob/main/PRIVACY.md','https://github.com/Hirota777/streamer-crew-link/blob/main/TERMS.md','https://github.com/Hirota777/streamer-crew-link/issues','https://streamkit.discord.com/overlay']);
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

const legalPaths=new Set(['/licenses','/legal/application','/legal/notices','/legal/electron','/legal/chromium','/legal/reader','/legal/dotnet','/legal/dotnet-third-party','/legal/capture','/legal/assets','/legal/players','/legal/ffmpeg-source']);
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
