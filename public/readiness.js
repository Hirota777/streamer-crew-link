// These checks describe this app's state. OBS confirmation is explicitly manual.
export function connectionAdvice(state){
 const game=state.game,discord=state.discord,auth=discord.auth,status=discord.status;
 let g,d;
 if(state.reader.status==='unsupported')g={title:'ゲームのバージョンが未対応です',detail:state.reader.message,action:'対応範囲を見る',target:'versions'};
 else if(state.reader.status==='error')g={title:'ゲーム情報を読み取れません',detail:state.reader.message+'。ゲームと本アプリの起動状態を確認し、必要なら本アプリを起動し直してください。',action:'接続を確認',target:'connections'};
 else if(!game.online)g={title:'ゲームの情報が届いていません',detail:state.reader.message||'Among Usを起動し、ロビーに参加してください。',action:'接続を確認',target:'connections'};
 else if(!game.players.length)g={title:'ロビーの参加者を待っています',detail:'Among Usのロビーに参加してください。参加すると自動で読み取ります。',action:'接続を確認',target:'connections'};
 else if(game.players.some(p=>p.colorKnown===false))g={title:'一部のキャラクター色が取得待ちです',detail:state.reader.message||'ロビーで少し待ち、改善しない場合は対応バージョンを確認してください。',action:'対応範囲を見る',target:'versions'};
 else g={ok:true,title:'ゲームの色を取得しています',detail:game.players.length+'人の参加者を取得しています。'};
 if(auth.busy)d={title:'Discordへの接続を進めています',detail:'許可画面が開いている場合は内容を確認してください。自動接続の場合は完了までお待ちください。'};
 else if(auth.needsAuthorization)d={title:'Discordの許可を確認してください',detail:auth.lastError||'許可が無効か、Discordに接続を拒否されています。許可をやり直し、改善しない場合は配布者にテスター登録・RPC利用条件を確認してください。',action:'許可を確認',target:'authorize'};
 else if(status==='接続中')d={ok:true,title:'Discordのサーバー通話に接続しています',detail:discord.members.length+'人の参加者を取得しています。'};
 else if(status==='通話への参加を待っています')d={title:'Discordのサーバー通話に未参加です',detail:'Discordでサーバーのボイスチャンネルに参加してください。個人・グループ通話は表示対象外です。対象チャンネルを指定している場合はIDも確認してください。',action:'詳細設定を見る',target:'channel'};
 else if(auth.saved&&!auth.autoConnect)d={title:'自動接続を一時停止しています',detail:'「今回は切断」により停止中です。保存した認証で再開できます。',action:'接続を再開',target:'reconnect'};
 else if(auth.autoConnect)d={title:'Discordへの再接続を待っています',detail:(auth.lastError?auth.lastError+' ':'')+'Discordデスクトップ版の起動を確認してください。起動後は自動で再試行します。',action:'接続を確認',target:'connections'};
 else d={title:auth.lastError?'Discordに接続できませんでした':'Discordとの連携が必要です',detail:auth.lastError||'Discordデスクトップ版を起動し、「Discordと連携・許可」から連携してください。',action:'連携を設定',target:'authorize'};
 return {game:g,discord:d};
}
export function preflight(state,{pending=false,obsConfirmed=false}={}){
 const advice=connectionAdvice(state),demo=state.mode==='demo';
 const unlinked=state.game.players.filter(p=>!state.preset.links.some(l=>l.gameKey===p.key));
 const missing=state.rows.filter(r=>r.visible&&(!r.player||!r.member));
 const shown=state.rows.filter(r=>r.visible&&r.player&&r.member).length;
 const mapped=shown>0&&!unlinked.length&&!missing.length;
 const checks=[
  {id:'game',label:'ゲーム・色取得',ok:!demo&&!!advice.game.ok,detail:demo?'デモのため実接続は未確認です。':advice.game.detail,target:advice.game.target||'connections'},
  {id:'discord',label:'Discord通話',ok:!demo&&!!advice.discord.ok,detail:demo?'デモのため実接続は未確認です。':advice.discord.detail,target:advice.discord.target||'connections'},
  {id:'mapping',label:'メンバーの対応づけ',ok:!demo&&mapped,detail:demo?'本番のメンバーで確認してください。':unlinked.length?unlinked.length+'人が未設定です。表示しない人も対応づけて「表示」をオフにできます。':missing.length?missing.length+'人がゲームまたは通話に不在です。':shown?shown+'人を表示します。非表示の設定も反映しています。':'表示するメンバーがいません。',target:'mapping'},
  {id:'save',label:'設定の保存',ok:!demo&&!pending,detail:demo?'本番表示に戻してから確認してください。':pending?'未保存の変更があります。保存するとOBSへ反映されます。':'現在の設定を保存済みです。',target:'save'},
  {id:'obs',label:'OBSでの表示確認',ok:!demo&&obsConfirmed&&!pending,detail:obsConfirmed&&!pending?'この起動中に、利用者がOBSで確認しました。':'OBSのブラウザーソースにURLと推奨サイズを設定し、表示・見切れを確認してください。自動判定は行いません。',target:'obs'}
 ];
 return {checks,ready:checks.every(c=>c.ok),done:checks.filter(c=>c.ok).length,demo};
}
