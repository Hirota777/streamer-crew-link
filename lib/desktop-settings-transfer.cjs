const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
exports.setupSettingsTransfer=function({ipcMain,dialog,getWindow,store,isTrusted,documents}){
 ipcMain.handle('crew-link:export-settings',async event=>{
  isTrusted(event);const value=store.exportSettings(),bytes=Buffer.from(JSON.stringify(value,null,2),'utf8');
  if(bytes.length>1024*1024)throw Error('設定ファイルが大きすぎます。');
  const result=await dialog.showSaveDialog(getWindow(),{title:'設定一式を書き出す',defaultPath:path.join(documents(),'Streamer-crew-link-settings.json'),filters:[{name:'設定ファイル（JSON）',extensions:['json']}]});
  if(result.canceled||!result.filePath)return false;
  const temp=result.filePath+'.tmp-'+randomUUID();try{await fs.writeFile(temp,bytes,{flag:'wx',mode:0o600});await fs.rename(temp,result.filePath);}catch(e){await fs.unlink(temp).catch(()=>{});throw e;}return true;
 });
 ipcMain.handle('crew-link:read-settings',async event=>{
  isTrusted(event);const result=await dialog.showOpenDialog(getWindow(),{title:'設定一式を読み込む',properties:['openFile'],filters:[{name:'設定ファイル（JSON）',extensions:['json']}]});
  if(result.canceled||!result.filePaths?.length)return null;
  const file=result.filePaths[0],info=await fs.stat(file);if(!info.isFile()||info.size>1024*1024)throw Error('1 MB以内の設定JSONファイルを選んでください。');
  const bytes=await fs.readFile(file);if(bytes.length>1024*1024)throw Error('設定ファイルが大きすぎます。');
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,''));}catch{throw Error('設定JSONファイルを読み込めません。形式を確認してください。');}
  store.cleanSettingsFile(value);return value;
 });
};
