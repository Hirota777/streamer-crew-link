import {renderCrew} from './render.js';
import {appendCharacter} from './icons.js';
const $=s=>document.querySelector(s);let state,token,draft=[],dirty=false,settingsDirty=false,lastKey='',authUiSaved;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function post(url,data){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
function settings(){return {size:Number($('#size').value),gap:Number($('#gap').value),showNames:$('#showNames').checked,dimIdle:$('#dimIdle').checked};}
function syncSettings(){for(const [k,v]of Object.entries(state.preset.settings)){const el=$('#'+k);if(el.type==='checkbox')el.checked=v;else el.value=v;}updateOutputs();}
function updateOutputs(){$('#size-value').textContent=$('#size').value+' px';$('#gap-value').textContent=$('#gap').value+' px';}
function gameRows(){const ids=new Set(state.game.players.map(p=>p.key));return [...draft.map(l=>({link:l,player:state.game.players.find(p=>p.key===l.gameKey)})),...state.game.players.filter(p=>!draft.some(l=>l.gameKey===p.key)).map(p=>({player:p,link:null}))];}
function table(){
  const rows=gameRows();$('#mapping-empty').hidden=rows.length>0;
  $('#mapping-rows').replaceChildren(...rows.map(({link,player},idx)=>{
    const tr=document.createElement('tr'),td=document.createElement('td'),key=player?.key||link.gameKey;
    const chip=document.createElement('span');chip.className='game-chip';if(player){appendCharacter(chip,player);}const name=document.createElement('span');name.textContent=player?.name||link?.gameName||'未参加の保存メンバー';td.append(chip,name);
    const detail=document.createElement('small');detail.className='player-detail';detail.textContent=player?(player.stable?'保存用IDあり':'名前で照合・変更時は再設定'):'ゲーム接続時に再確認';td.append(detail);tr.append(td);
    const select=document.createElement('select');const none=document.createElement('option');none.value='';none.textContent='参加者を選択';select.append(none);
    const members=[...state.discord.members];if(link&&!members.some(m=>m.id===link.discordId))members.push({id:link.discordId,name:'未参加の保存メンバー'});
    for(const m of members){const option=document.createElement('option');option.value=m.id;option.textContent=m.name;select.append(option);}select.value=link?.discordId||'';select.disabled=state.mode==='demo';
    const memberCell=document.createElement('td');memberCell.append(select);tr.append(memberCell);
    const label=document.createElement('input');label.value=link?.label||'';label.placeholder='Discordの名前を使用';label.maxLength=80;label.disabled=state.mode==='demo';const labelCell=document.createElement('td');labelCell.append(label);tr.append(labelCell);
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=link?.visible!==false;visible.disabled=state.mode==='demo';const visCell=document.createElement('td');visCell.append(visible);tr.append(visCell);
    const controls=document.createElement('td');
    function ensure(){let l=draft.find(l=>l.gameKey===key);if(!l){l={gameKey:key,gameName:player?.name||'',discordId:select.value,label:label.value,visible:visible.checked};draft.push(l);}if(player)l.gameName=player.name;return l;}
    select.onchange=()=>{if(select.value&&draft.some(l=>l.gameKey!==key&&l.discordId===select.value)){toast('そのDiscord参加者は別のプレイヤーに設定されています。');select.value=link?.discordId||'';return;}if(!select.value)draft=draft.filter(l=>l.gameKey!==key);else ensure().discordId=select.value;dirty=true;lastKey='';};
    label.oninput=()=>{if(select.value){ensure().label=label.value;dirty=true;}};visible.onchange=()=>{if(select.value){ensure().visible=visible.checked;dirty=true;}};
    for(const [text,offset]of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.textContent=text;button.className='order-button';const i=draft.findIndex(l=>l.gameKey===key);button.disabled=state.mode==='demo'||i<0||i+offset<0||i+offset>=draft.length;button.onclick=()=>{[draft[i],draft[i+offset]]=[draft[i+offset],draft[i]];dirty=true;table();};controls.append(button);}tr.append(controls);return tr;
  }));
}
function receive(s){
  const changed=state?.preset.id!==s.preset.id, modeChanged=state?.mode!==s.mode;state=s;
  if(changed||modeChanged||!dirty){draft=structuredClone(s.mode==='demo'?s.rows.map(({gameKey,discordId,label,visible})=>({gameKey,discordId,label,visible})):s.preset.links);if(changed||modeChanged)dirty=false;}
  if(changed||!settingsDirty)syncSettings();
  $('#game-status').textContent=s.mode==='demo'?'デモ表示中':s.reader?.status==='unsupported'?'未対応バージョン':s.game.online?'外部読取で接続中':'接続待ち';$('#game-dot').classList.toggle('online',s.game.online);$('#game-version').textContent=s.mode==='demo'?'表示確認用の架空メンバー':s.reader?.message||'Among Usの起動を待っています';
  $('#discord-status').textContent=s.discord.status;$('#discord-dot').classList.toggle('online',s.mode==='demo'||s.discord.status==='接続中');$('#discord-channel').textContent=s.discord.channel||'サーバーの通話に接続してください';
  const auth=s.discord.auth;
  $('#auth-summary').textContent=auth.needsAuthorization?'Discordの許可をやり直してください。登録アプリのRPC利用条件も確認してください。':auth.saved?(auth.autoConnect?'認証を暗号化して保存済みです。次回起動時も自動接続します。':'認証は保存済みです。今回は切断しています。次回起動時は自動接続します。'):auth.storageAvailable?'初回にDiscordの許可を行うと、認証を暗号化して保存し、次回から自動接続します。':'認証の保存はWindowsデスクトップ版で利用できます。';
  $('#reconnect-discord').hidden=!auth.saved||auth.needsAuthorization;$('#forget-discord').hidden=!auth.saved;
  $('#reconnect-discord').disabled=auth.busy;$('#connect-discord').disabled=auth.busy;
  $('#remember-discord').disabled=!auth.storageAvailable;
  if(!auth.storageAvailable)$('#remember-discord').checked=false;
  if(authUiSaved!==auth.saved){const form=$('#discord-form');form.elements.channelId.value=auth.channelId||'';authUiSaved=auth.saved;}
  $('#notice').hidden=s.mode!=='demo';$('#notice').textContent='デモ表示中 — 架空の参加者です。実際のゲーム・Discord接続とは連動していません。';$('#demo').textContent=s.mode==='demo'?'実際の接続に戻る':'デモを試す';$('#save').disabled=s.mode==='demo';
  const count=renderCrew($('#preview-crew'),s);$('#member-count').textContent=count;$('#preview-empty').hidden=count>0;$('#mapping-status').textContent=s.unmapped?`${s.unmapped}人が未設定です`:'対応づけ済みのメンバーを表示します';
  const selected=$('#presets').value;if([...$('#presets').options].map(o=>o.value+o.textContent).join()!==s.presets.map(p=>p.id+p.name).join()){$('#presets').replaceChildren(...s.presets.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));}$('#presets').value=s.preset.id;
  const missing=s.rows.filter(r=>!r.player||!r.member);$('#unresolved').hidden=!missing.length||s.mode==='demo';$('#unresolved').textContent=`保存メンバーのうち${missing.length}人はゲームまたは通話で確認できません。名前変更・退出・接続状態を確認してください。`;
  const key=JSON.stringify([s.mode,s.game.players,s.discord.members.map(m=>({id:m.id,name:m.name})),s.preset.id]);
  if(key!==lastKey&&!document.querySelector('#mapping-rows :focus')){table();lastKey=key;}
}
try{const bootstrap=await(await fetch('/api/bootstrap')).json();token=bootstrap.token;receive(bootstrap);const stream=new EventSource('/api/events');stream.onmessage=e=>receive(JSON.parse(e.data));stream.onerror=()=>{$('#notice').hidden=false;$('#notice').textContent='アプリとの接続が切れました。起動状態を確認してください。';};}catch{toast('アプリに接続できません。起動し直してください。');}
$('#demo').onclick=async()=>{if(dirty||settingsDirty){toast('変更を保存してから表示モードを切り替えてください。');return;}try{receive(await post('/api/demo',{enabled:state.mode!=='demo'}));}catch(e){toast(e.message);}};
$('#save').onclick=async()=>{try{const s=await post('/api/save',{links:draft,settings:settings()});dirty=false;settingsDirty=false;receive(s);toast('設定を保存しました。');}catch(e){toast(e.message);}};
$('#presets').onchange=async e=>{if(dirty||settingsDirty){e.target.value=state.preset.id;toast('変更を保存してからプリセットを切り替えてください。');return;}try{lastKey='';receive(await post('/api/presets/select',{id:e.target.value}));}catch(e){toast(e.message);}};
$('#create-preset').onclick=async()=>{try{if(state.mode==='demo')throw Error('実際の接続に戻してからプリセットを保存してください。');if(!$('#preset-name').value.trim())throw Error('プリセット名を入力してください。');await post('/api/save',{links:draft,settings:settings()});const s=await post('/api/presets/create',{name:$('#preset-name').value});dirty=false;settingsDirty=false;lastKey='';receive(s);$('#preset-name').value='';toast('新しいプリセットを保存しました。');}catch(e){toast(e.message);}};
for(const k of ['size','gap','showNames','dimIdle'])$('#'+k).oninput=()=>{if(state.mode==='demo'){toast('表示設定は実際の接続に戻ってから保存できます。');syncSettings();return;}settingsDirty=true;updateOutputs();};
$('#copy-url').onclick=async()=>{try{await navigator.clipboard.writeText(state.overlayUrl);toast('OBS用URLをコピーしました。');}catch{toast('表示されているURLを選択してコピーしてください。');}};
$('#discord-form').onsubmit=async e=>{e.preventDefault();if(dirty||settingsDirty){toast('変更を保存してから接続してください。');return;}const b=Object.fromEntries(new FormData(e.target));b.remember=$('#remember-discord').checked;$('#connect-discord').disabled=true;try{receive(await post('/api/discord/connect',b));toast('Discordに接続しました。');}catch(e){toast(e.message);}finally{$('#connect-discord').disabled=false;}};
$('#disconnect-discord').onclick=async()=>{try{receive(await post('/api/discord/disconnect',{}));}catch(e){toast(e.message);}};
$('#reconnect-discord').onclick=async()=>{try{receive(await post('/api/discord/reconnect',{}));}catch(e){toast(e.message);}};
$('#forget-discord').onclick=async()=>{try{receive(await post('/api/discord/forget',{}));$('#discord-form').reset();toast('このPCに保存したDiscordの認証を削除しました。');}catch(e){toast(e.message);}};
window.addEventListener('beforeunload',e=>{if(dirty||settingsDirty){e.preventDefault();e.returnValue='';}});
