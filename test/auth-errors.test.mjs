import {test} from 'node:test';import assert from 'node:assert/strict';import {oauthFailure,rpcFailure,authorizationFailure} from '../lib/auth-errors.mjs';
test('アプリ設定の拒否・認証更新の失効・一時障害を分け、Discordの応答本文を公開しない',()=>{
 const denied=authorizationFailure('invalid_scope');assert.equal(denied.diagnostic.code,'invalid_scope');assert.equal(denied.diagnostic.stage,'authorization');assert.doesNotMatch(denied.message,/キャンセル|失効/);
 const setup=oauthFailure(401,{error:'invalid_client',error_description:'secret-access-token',access_token:'secret-access-token'},'authorization_code');assert.equal(setup.authRequired,false);assert.equal(setup.retryable,false);assert.equal(setup.diagnostic.stage,'token_exchange');assert.equal(JSON.stringify(setup).includes('secret-access-token'),false);assert.equal(setup.message.includes('secret-access-token'),false);
 const expired=oauthFailure(400,{error:'invalid_grant'},'refresh_token');assert.equal(expired.authRequired,true);assert.equal(expired.diagnostic.stage,'token_refresh');assert.match(expired.message,/保存済み/);
 const transient=oauthFailure(503,{error:'invalid_client'},'authorization_code');assert.equal(transient.retryable,true);
 const unknown=oauthFailure(400,{error:'secret-access-token'},'authorization_code');assert.equal(unknown.diagnostic.code,'unknown_error');
});
test('RPCのアクセス拒否をトークン無効と取り違えない',()=>{const permission=rpcFailure(4006,'GET_CHANNEL');assert.equal(permission.authRequired,false);assert.equal(permission.diagnostic.code,4006);const token=rpcFailure(4009,'AUTHENTICATE');assert.equal(token.authRequired,true);assert.equal(rpcFailure(4006,'secret').diagnostic.command,'RPC');});
