import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {OAuthFlow,pkce} from '../lib/oauth.mjs';
import {APPLICATION} from '../lib/application.mjs';
import {Discord} from '../lib/discord.mjs';

test('認証ごとにPKCEを生成し、verifierをブラウザーへ送らない',()=>{
 const a=pkce(),b=pkce();assert.match(a.verifier,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a.verifier,b.verifier);assert.equal(a.challenge,createHash('sha256').update(a.verifier).digest('base64url'));
});
test('正しいstateだけを一度受け付け、認証コードとverifierをアプリ内に返す',async()=>{
 let opened;const f=new OAuthFlow({application:APPLICATION,openExternal:async url=>{opened=new URL(url);}});const pending=f.begin();
 assert.equal(opened.origin,'https://discord.com');assert.equal(opened.searchParams.get('code_challenge_method'),'S256');assert.equal(opened.searchParams.has('client_secret'),false);
 assert.equal(f.callback(new URL(APPLICATION.redirectUri+'?state=bad&code=test')).status,400);
 const callback=new URL(APPLICATION.redirectUri);callback.search=new URLSearchParams({state:opened.searchParams.get('state'),code:'one-use-code'}).toString();
 assert.equal(f.callback(callback).status,303);const result=await pending;assert.equal(result.code,'one-use-code');assert.equal(createHash('sha256').update(result.verifier).digest('base64url'),opened.searchParams.get('code_challenge'));assert.equal(f.callback(callback).status,409);
});
test('許可拒否と接続中止はコード交換を実行せず終了する',async()=>{
 let url;const f=new OAuthFlow({application:APPLICATION,openExternal:async value=>url=new URL(value)});let pending=f.begin();const denied=new URL(APPLICATION.redirectUri);denied.search=new URLSearchParams({state:url.searchParams.get('state'),error:'access_denied'}).toString();f.callback(denied);await assert.rejects(pending,/キャンセル/);pending=f.begin();f.cancel();await assert.rejects(pending,/キャンセル/);
});
test('公開クライアントのコード交換と更新にはClient Secretを送信しない',async()=>{
 const requests=[];const client=new Discord({authorize:async()=>({code:'test-code',verifier:'test-verifier'}),fetcher:async(_url,options)=>{requests.push(options.body);return {ok:true,json:async()=>({access_token:'new-token',refresh_token:'new-refresh',expires_in:3600})};}});
 client.open=async()=>{};client.call=async()=>({});client.refresh=async()=>{};
 await client.connect({...APPLICATION,clientSecret:'must-not-be-sent',interactive:true});client.close();assert.equal(requests[0].get('code_verifier'),'test-verifier');assert.equal(requests[0].has('client_secret'),false);
 await client.connect({...APPLICATION,clientSecret:'must-not-be-sent',interactive:false,tokens:{accessToken:'old',refreshToken:'refresh',expiresAt:0}});client.close();assert.equal(requests[1].get('grant_type'),'refresh_token');assert.equal(requests[1].has('client_secret'),false);
});
