import {readFile,writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import path from 'node:path';

// The cipher is supplied by Electron's Windows DPAPI-backed safeStorage.
// Never fall back to storing credentials as plain text.
export class CredentialVault {
  constructor(directory,cipher){this.directory=directory;this.file=path.join(directory,'discord-auth.bin');this.cipher=cipher;this.queue=Promise.resolve();}
  async available(){return Boolean(this.cipher&&await this.cipher.available());}
  async load(){
    let bytes;try{bytes=await readFile(this.file);}catch(e){if(e.code==='ENOENT')return null;throw Error('保存済み認証を読み込めません。');}
    if(!await this.available())throw Error('Windowsの認証情報の暗号化を利用できません。');
    try{const record=JSON.parse(await this.cipher.decrypt(bytes));if(record.schema!==1||!/^\d{15,22}$/.test(record.credentials?.clientId??'')||(!record.credentials?.clientSecret&&record.credentials?.authMode!=='public-pkce')||!record.tokens?.accessToken||!Number.isFinite(record.tokens.expiresAt))throw Error();return record;}catch{throw Error('保存済み認証を復元できません。初回連携をやり直してください。');}
  }
  enqueue(action){const task=this.queue.then(action);this.queue=task.catch(()=>{});return task;}
  save(record){return this.enqueue(async()=>{if(!await this.available())throw Error('Windowsの認証情報の暗号化を利用できません。');const encrypted=await this.cipher.encrypt(JSON.stringify(record));await mkdir(this.directory,{recursive:true});await writeFile(this.file+'.tmp',encrypted,{mode:0o600});await rename(this.file+'.tmp',this.file);});}
  clear(){return this.enqueue(async()=>{for(const name of [this.file,this.file+'.tmp'])try{await unlink(name);}catch(e){if(e.code!=='ENOENT')throw Error('保存済み認証を削除できません。');}});}
}
