import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {CredentialVault} from '../lib/vault.mjs';
import {DiscordSession} from '../lib/discord-session.mjs';
import {Discord} from '../lib/discord.mjs';
import {APPLICATION} from '../lib/application.mjs';

const credentials={...APPLICATION,channelId:''};
const tokens={accessToken:'access-for-test',refreshToken:'refresh-for-test',expiresAt:Date.now()+3600000};
const record={schema:1,credentials,tokens};
class FakeClient extends EventEmitter {
 members=[];channel=null;status='未接続';calls=[];fail=null;
 async connect(options){this.calls.push(options);if(this.fail)throw this.fail;if(options.interactive)await options.onToken(tokens);this.status='接続中';this.channel={id:'voice',name:'通話'};this.emit('change');}
 close(){this.status='未接続';this.channel=null;this.members=[];this.emit('change');}
}
function harness(saved=null){let stored=saved,scheduled=[];const client=new FakeClient();const vault={available:async()=>true,load:async()=>stored,save:async r=>{stored=structuredClone(r);},clear:async()=>{stored=null;}};const session=new DiscordSession({client,vault,schedule:(fn,ms)=>{const item={ms,fn:()=>{scheduled=scheduled.filter(x=>x!==item);return fn();}};scheduled.push(item);return item;},cancel:item=>{scheduled=scheduled.filter(x=>x!==item);}});return {session,client,get stored(){return stored;},get scheduled(){return scheduled;}};}
test('許可済みの認証を保存し、再起動後はAUTHORIZEを要求せず接続',async()=>{
 const a=harness();await a.session.initialize();await a.session.connect({...credentials,remember:true});assert.equal(a.stored.tokens.refreshToken,tokens.refreshToken);assert.equal(a.session.info().saved,true);
 const b=harness(a.stored);await b.session.initialize();await b.session.start();assert.equal(b.client.calls[0].interactive,false);assert.equal(b.client.calls[0].tokens.accessToken,tokens.accessToken);assert.equal(b.session.status,'接続中');assert.equal('clientSecret' in b.stored.credentials,false);assert.equal(JSON.stringify(b.session.info()).includes('secret-for-test'),false);a.session.shutdown();b.session.shutdown();
});
test('Discordの後起動・切断時に自動再試行し、今回は切断すると止まる',async()=>{
 const h=harness(record);await h.session.initialize();h.client.fail=Error('not running');await h.session.start();assert.equal(h.scheduled[0].ms,5000);h.client.fail=null;await h.scheduled[0].fn();await new Promise(r=>setImmediate(r));assert.equal(h.client.calls.length,2);h.client.emit('disconnect');assert.equal(h.scheduled[0].ms,5000);h.session.disconnect();assert.equal(h.scheduled.length,0);assert.equal(h.session.info().saved,true);
});
test('許可が取り消されたら再試行・自動許可要求を止める',async()=>{
 const h=harness(record);await h.session.initialize();h.client.fail=Object.assign(Error('invalid grant'),{authRequired:true});await h.session.start();assert.equal(h.session.info().needsAuthorization,true);assert.equal(h.scheduled.length,0);assert.equal(h.client.calls[0].interactive,false);h.session.shutdown();
});
test('認証削除後は再起動しても自動接続しない',async()=>{
 const h=harness(record);await h.session.initialize();await h.session.forget();assert.equal(h.stored,null);assert.equal(h.session.info().saved,false);await h.session.start();assert.equal(h.client.calls.length,0);
});
test('保存をオフにした場合、接続が失敗しても以前の保存認証を残さない',async()=>{
 const h=harness(record);await h.session.initialize();h.client.fail=Error('connection failed');await assert.rejects(h.session.connect({...credentials,remember:false}));assert.equal(h.stored,null);assert.equal(h.session.info().saved,false);h.session.shutdown();
});
test('切断後に遅れて届いた初回認証結果を保存しない',async()=>{
 const h=harness();await h.session.initialize();let finish;h.client.connect=async options=>{await new Promise(r=>finish=r);await options.onToken(tokens);};const connecting=h.session.connect({...credentials,remember:true});h.session.disconnect();finish();await connecting;assert.equal(h.stored,null);assert.equal(h.session.info().saved,false);
});
test('期限切れトークンを更新し、ローテーションされたrefresh tokenを認証前に保存',async()=>{
 let requestBody;const events=[];const d=new Discord({fetcher:async(_url,init)=>{requestBody=init.body;return {ok:true,json:async()=>({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600})};}});
 d.open=async()=>{};d.call=async cmd=>{events.push(cmd);return {};};d.refresh=async()=>{};
 await d.connect({...credentials,tokens:{...tokens,expiresAt:0},interactive:false,onToken:async t=>{events.push('saved');assert.equal(t.refreshToken,'new-refresh');}});
 assert.equal(requestBody.get('grant_type'),'refresh_token');assert.equal(events.includes('AUTHORIZE'),false);assert.ok(events.indexOf('saved')<events.indexOf('AUTHENTICATE'));d.close();
});
test('有効な保存トークンでは認証サーバーにも許可画面にもアクセスしない',async()=>{
 const d=new Discord({fetcher:async()=>{throw Error('must not fetch');}});const commands=[];d.open=async()=>{};d.call=async cmd=>{commands.push(cmd);return {};};d.refresh=async()=>{};
 await d.connect({...credentials,tokens,interactive:false});assert.equal(commands.includes('AUTHORIZE'),false);assert.equal(commands.includes('AUTHENTICATE'),true);d.close();
});
test('認証ファイルは暗号文のみで、復元・破損検知・削除ができる',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'crewlink-vault-')),key=randomBytes(32);
 const cipher={available:async()=>true,encrypt:async plain=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(plain,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decrypt:async bytes=>{const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();}};
 try{const v=new CredentialVault(directory,cipher);await v.save(record);const bytes=await readFile(v.file);assert.equal(bytes.includes(Buffer.from('must-not-exist-secret')),false);assert.equal(bytes.includes(Buffer.from(tokens.accessToken)),false);assert.deepEqual(await v.load(),record);await writeFile(v.file,'broken');await assert.rejects(v.load(),/復元できません/);await v.clear();assert.equal(await v.load(),null);const unavailable=new CredentialVault(directory,{available:async()=>false});await assert.rejects(unavailable.save(record),/暗号化/);}finally{await rm(directory,{recursive:true,force:true});}
});
