const oauthCodes=new Set(['invalid_request','invalid_client','invalid_grant','unauthorized_client','unsupported_grant_type','invalid_scope','access_denied']);
export function authorizationFailure(value){
 const code=oauthCodes.has(value)?value:'unknown_error';
 const text=code==='access_denied'?'Discordの許可画面からアクセス拒否が返されました。利用者による中止、またはアプリの利用条件による拒否が考えられます。':code==='invalid_scope'||code==='unauthorized_client'?'Discordが要求権限またはアプリの利用資格を拒否しました。連携を許可し直し、解消しない場合はエラーコードをサポート窓口へ連絡してください。':'Discordの許可画面から認証エラーが返されました。アプリのOAuth設定を確認してください。';
 const error=Error(text+'（'+code+'）');error.authRequired=true;error.retryable=false;error.diagnostic={stage:'authorization',code};return error;
}
export function oauthFailure(status,data,grant){
 const code=oauthCodes.has(data?.error)?data.error:'unknown_error';
 const refreshing=grant==='refresh_token';
 let message;
 if(status===429||status>=500)message='Discordの認証サーバーが混み合っているか、一時的に利用できません。';
 else if(code==='invalid_client')message='Discordがアプリのクライアント認証を拒否しました。公開クライアント設定・認証方式の確認が必要です。';
 else if(code==='invalid_grant')message=refreshing?'Discordの保存済み認証を更新できません。期限切れ・許可取消しなどのため、連携をやり直してください。':'Discordが認証コードを受け付けませんでした。コードの期限・使用済み・戻り先・PKCEの確認が必要です。';
 else if(code==='invalid_scope'||code==='unauthorized_client')message='Discordがこのアプリの認証方式または要求権限を許可していません。アプリのRPC利用条件を確認してください。';
 else if(code==='access_denied')message='Discordの認証が拒否されました。許可内容とアプリの利用条件を確認してください。';
 else message='Discordとのトークン交換に失敗しました。アプリの認証設定を確認してください。';
 const error=Error(message+'（'+code+' / HTTP '+status+'）');
 error.authRequired=code==='invalid_grant'||code==='access_denied';
 error.retryable=status===429||status>=500;
 error.diagnostic={stage:refreshing?'token_refresh':'token_exchange',code,httpStatus:status};return error;
}
export function rpcFailure(code,command){
 const n=Number.isInteger(code)?code:null;
 const known=new Set(['AUTHENTICATE','AUTHORIZE','SUBSCRIBE','UNSUBSCRIBE','GET_CHANNEL','GET_SELECTED_VOICE_CHANNEL']);
 const safeCommand=known.has(command)?command:'RPC';
 const text=n===4009?'Discordが認証トークンを無効と判定しました。連携をやり直してください。':n===4006?'Discordが通話情報へのアクセスを拒否しました。RPCの利用許可・対象チャンネルを確認してください。':'Discordが操作を拒否しました。認証の失効とは限りません。';
 const error=Error(text+'（'+safeCommand+' / RPC '+(n??'不明')+'）');error.authRequired=n===4009;error.retryable=false;error.diagnostic={stage:'rpc',code:n,command:safeCommand};return error;
}
