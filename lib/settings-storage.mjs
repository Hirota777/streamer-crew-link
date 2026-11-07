import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';

export class SettingsStorage {
 constructor(directory,{cipher=null,allowPlaintext=false}={}){this.cipher=cipher;this.allowPlaintext=allowPlaintext;this.legacy=path.join(directory,'settings.json');this.file=path.join(directory,cipher?'settings.bin':'settings.json');}
 async assertAvailable(){if(this.cipher){if(!await this.cipher.available())throw Error('Windowsの設定データ暗号化を利用できません。');}else if(!this.allowPlaintext)throw Error('設定の暗号化にはWindowsデスクトップ版を利用してください。');}
 async read(){
  await this.assertAvailable();
  try{const bytes=await readFile(this.file);return {data:JSON.parse(this.cipher?await this.cipher.decrypt(bytes):bytes.toString('utf8'))};}catch(e){if(e.code!=='ENOENT')throw e;}
  if(this.cipher){try{return {data:JSON.parse(await readFile(this.legacy,'utf8')),migrate:true};}catch(e){if(e.code!=='ENOENT')throw e;}}
  return {data:null,missing:true,migrate:Boolean(this.cipher)};
 }
 async write(data){
  await this.assertAvailable();const plain=JSON.stringify(data,null,2),bytes=this.cipher?await this.cipher.encrypt(plain):Buffer.from(plain);
  if(this.cipher&&await this.cipher.decrypt(bytes)!==plain)throw Error('設定の暗号化を確認できません。');
  const temp=this.file+'.tmp';await writeFile(temp,bytes,{mode:0o600});await rename(temp,this.file);
 }
 async removeLegacy(){
  if(!this.cipher)return;
  // Only the app's two known legacy files; never remove arbitrary backups.
  for(const file of [this.legacy,this.legacy+'.tmp'])try{await unlink(file);}catch(e){if(e.code!=='ENOENT')throw Error('旧形式の設定を削除できません。ファイルの使用状態を確認してください。');}
 }
}
