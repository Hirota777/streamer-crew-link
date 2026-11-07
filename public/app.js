import {renderCrew} from './render.js';
import {appendCharacter} from './icons.js';
const $=selector=>document.querySelector(selector);
let state,token,draft=[],dirty=false,settingsDirty=false,saving=false,editRevision=0,lastKey='',authUiSaved;
const views=['preview','mapping','connections'];
const settingKeys=['size','gap','characterScale','badgeSize','orientation','showStatus','showNames','dimIdle'];
for(const node of document.querySelectorAll('[data-character]'))appendCharacter(node,{color:node.dataset.character,colorKnown:true,lifeState:'alive'});
function openView(id,{focus=false}={}){
  if(!views.includes(id))id='preview';
  for(const view of views){const active=view===id;$('#'+view).hidden=!active;const tab=$('#tab-'+view);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  if(location.hash!=='#view-'+id)history.replaceState(null,'','#view-'+id);
  window.scrollTo(0,0);
  if(focus)$('#tab-'+id).focus();
  requestAnimationFrame(fitPreview);
}
for(const tab of document.querySelectorAll('[data-view]')){
  tab.onclick=()=>openView(tab.dataset.view);
  tab.onkeydown=event=>{const index=views.indexOf(tab.dataset.view);let next;
    if(event.key==='ArrowRight')next=(index+1)%views.length;
    if(event.key==='ArrowLeft')next=(index+views.length-1)%views.length;
    if(event.key==='Home')next=0;if(event.key==='End')next=views.length-1;
    if(next!==undefined){event.preventDefault();openView(views[next],{focus:true});}
  };
}
$('.brand').onclick=event=>{event.preventDefault();openView('preview');};
for(const button of document.querySelectorAll('[data-open-view]'))button.onclick=()=>openView(button.dataset.openView);
window.addEventListener('hashchange',()=>openView(location.hash.slice(1).replace(/^view-/,'')));
openView(location.hash.slice(1).replace(/^view-/,''));
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
async function post(url,data){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
function settings(){return {size:Number($('#size').value),gap:Number($('#gap').value),characterScale:Number($('#characterScale').value),badgeSize:Number($('#badgeSize').value),orientation:$('#orientation').value,showStatus:$('#showStatus').checked,showNames:$('#showNames').checked,dimIdle:$('#dimIdle').checked};}
function updateOutputs(){$('#size-value').textContent=$('#size').value+' px';$('#gap-value').textContent=$('#gap').value+' px';$('#characterScale-value').textContent=$('#characterScale').value+' %';$('#badgeSize-value').textContent=$('#badgeSize').value+' %';$('#obs-dimensions').textContent=$('#orientation').value==='vertical'?'縦：360 × 1080 · 透明':'横：1920 × 300 · 透明';}
function syncSettings(){for(const [key,value]of Object.entries(state.preset.settings)){const element=$('#'+key);if(element.type==='checkbox')element.checked=value;else element.value=value;}updateOutputs();}
function fitPreview(){const viewport=$('#preview-viewport'),crew=$('#preview-crew');if(viewport.classList.contains('actual'))return;if(!viewport.clientWidth||!crew.offsetWidth)return;const scale=Math.min(1,(viewport.clientWidth-40)/crew.offsetWidth,(viewport.clientHeight-34)/Math.max(1,crew.offsetHeight));crew.style.setProperty('--preview-scale',String(scale));$('#preview-scale-label').hidden=!crew.children.length||scale>=.99;}
new ResizeObserver(fitPreview).observe($('#preview-viewport'));
function renderPreview(){
  if(!state)return;
  const rows=state.mode==='demo'?state.rows:draft.map(link=>({...link,player:state.game.players.find(p=>p.key===link.gameKey)||null,member:state.discord.members.find(m=>m.id===link.discordId)||null}));
  const count=renderCrew($('#preview-crew'),{...state,rows,preset:{...state.preset,settings:settings()}});
  $('#preview-viewport').classList.toggle('portrait',settings().orientation==='vertical');
  $('#preview-empty').hidden=count>0;
  const badge=$('#preview-mode');badge.textContent=state.mode==='demo'?'デモ表示':dirty||settingsDirty?'未保存のプレビュー':'本番表示';badge.classList.toggle('demo',state.mode==='demo');
  const vertical=settings().orientation==='vertical',crew=$('#preview-crew');
  const suggestedWidth=Math.max(vertical?360:1920,Math.ceil((crew.offsetWidth+48)/20)*20);
  const suggestedHeight=Math.max(vertical?1080:300,Math.ceil((crew.offsetHeight+48)/20)*20);
  $('#obs-dimensions').textContent=(vertical?'縦：':'横：')+suggestedWidth+' × '+suggestedHeight+' · 透明';
  fitPreview();
}
function updateSaveState(){
  const pending=dirty||settingsDirty,demo=state?.mode==='demo';
  $('#save').disabled=demo||!pending||saving;$('#discard').hidden=!pending||demo;$('#discard').disabled=saving;
  $('#save-state').classList.toggle('dirty',pending&&!demo);
  $('#save-label').textContent=saving?'保存しています':demo?'デモ表示中':pending?'未保存の変更があります':'保存済み';
  $('#save-description').textContent=demo?'架空のメンバーで表示を確認しています':pending?'保存するとOBSにも反映されます':'次回も同じ設定を使えます';
}
function edited(){dirty=true;editRevision++;lastKey='';updateSaveState();renderPreview();}
function gameRows(){return [...draft.map(link=>({link,player:state.game.players.find(p=>p.key===link.gameKey)})),...state.game.players.filter(p=>!draft.some(link=>link.gameKey===p.key)).map(player=>({player,link:null}))];}
function table(){
  const rows=gameRows(),demo=state.mode==='demo';$('#mapping-empty').hidden=rows.length>0;
  $('#mapping-rows').replaceChildren(...rows.map(({link,player})=>{
    const tr=document.createElement('tr'),td=document.createElement('td'),key=player?.key||link.gameKey;
    const displayName=player?.name||link?.gameName||'保存済みメンバー';
    const chip=document.createElement('span');chip.className='game-chip';if(player)appendCharacter(chip,player);
    const name=document.createElement('span');name.className='player-name';name.textContent=displayName;td.append(chip,name);
    const detail=document.createElement('small');detail.className='player-detail';detail.textContent=!player?'ゲームに不在':!link?'Discord参加者を選択':state.discord.members.some(m=>m.id===link.discordId)?'対応づけ済み':'通話に不在';td.append(detail);tr.append(td);
    const select=document.createElement('select');select.setAttribute('aria-label',displayName+'のDiscord参加者');
    const none=document.createElement('option');none.value='';none.textContent='参加者を選択';select.append(none);
    const members=[...state.discord.members];if(link&&!members.some(m=>m.id===link.discordId))members.push({id:link.discordId,name:(link.label||link.gameName||'保存済み参加者')+'（通話に不在）'});
    for(const member of members){const option=document.createElement('option');option.value=member.id;option.textContent=member.name;select.append(option);}select.value=link?.discordId||'';select.disabled=demo;
    const memberCell=document.createElement('td');memberCell.append(select);tr.append(memberCell);
    const label=document.createElement('input');label.value=link?.label||'';label.placeholder='Discord名を使用';label.maxLength=80;label.disabled=demo||!select.value;label.setAttribute('aria-label',displayName+'の配信用の名前');const labelCell=document.createElement('td');labelCell.append(label);tr.append(labelCell);
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=link?.visible!==false;visible.disabled=demo||!select.value;visible.setAttribute('aria-label',displayName+'を表示');const visibleCell=document.createElement('td');visibleCell.append(visible);tr.append(visibleCell);
    function ensure(){let item=draft.find(l=>l.gameKey===key);if(!item){item={gameKey:key,gameName:player?.name||'',discordId:select.value,label:label.value,visible:visible.checked};draft.push(item);}if(player)item.gameName=player.name;return item;}
    select.onchange=()=>{
      const previous=draft.find(l=>l.gameKey===key);
      if(select.value&&draft.some(l=>l.gameKey!==key&&l.discordId===select.value)){toast('そのDiscord参加者は別のプレイヤーに設定されています。');select.value=previous?.discordId||'';return;}
      if(!select.value)draft=draft.filter(l=>l.gameKey!==key);else ensure().discordId=select.value;
      label.disabled=demo||!select.value;visible.disabled=demo||!select.value;detail.textContent=select.value?'対応づけ済み':'Discord参加者を選択';edited();
    };
    label.oninput=()=>{if(select.value){ensure().label=label.value;edited();}};
    visible.onchange=()=>{if(select.value){ensure().visible=visible.checked;edited();}};
    const controls=document.createElement('td');
    for(const [text,offset]of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.textContent=text;button.className='order-button';button.setAttribute('aria-label',displayName+(offset<0?'を前へ':'を後ろへ'));const index=draft.findIndex(l=>l.gameKey===key);button.disabled=demo||index<0||index+offset<0||index+offset>=draft.length;button.onclick=()=>{[draft[index],draft[index+offset]]=[draft[index+offset],draft[index]];edited();table();};controls.append(button);}tr.append(controls);return tr;
  }));
}
function updateNextStep(count){
  const demo=state.mode==='demo',connected=state.discord.status==='接続中';let title,description,action,target;
  if(demo){title='デモのメンバーを表示しています';description='架空の11人です。OBSにもデモの表示が出ます。';action='本番表示に戻る →';target='demo';}
  else if(!state.game.online||!connected){title=state.discord.auth.needsAuthorization?'Discordの許可を確認してください':!state.game.online?'ゲームを起動し、通話に参加しましょう':'Discordのサーバー通話に参加しましょう';description='ゲームと通話がそろったら、メンバーを対応づけます。';action='接続を確認 →';target='connections';}
  else if(!state.game.players.length){title='ゲームのロビーへの参加を待っています';description='参加者が見つかると、自動で一覧に表示されます。';action='接続を確認 →';target='connections';}
  else if(state.unmapped||!count){title=state.unmapped?state.unmapped+'人の対応づけがまだありません':'表示するメンバーを確認しましょう';description='ゲーム内の名前にDiscordの参加者を選んで、保存してください。';action='メンバーを設定 →';target='mapping';}
  else{title=count+'人の表示準備ができています';description='ブラウザーソースに下のURLを設定すると、配信に表示できます。';action='URLをコピー';target='copy';}
  $('#next-title').textContent=title;$('#next-description').textContent=description;$('#next-action').textContent=action;$('#next-action').dataset.action=target;$('#next-step').classList.toggle('ready',target==='copy');
}
function receive(next){
  const changed=state?.preset.id!==next.preset.id,modeChanged=state?.mode!==next.mode;state=next;
  if(changed||modeChanged){dirty=false;settingsDirty=false;lastKey='';}
  if(!dirty)draft=structuredClone(next.mode==='demo'?next.rows.map(({gameKey,discordId,label,visible})=>({gameKey,discordId,label,visible})):next.preset.links);
  if(!settingsDirty)syncSettings();
  const demo=next.mode==='demo',auth=next.discord.auth;
  $('#game-status').textContent=demo?'デモ表示中':next.reader?.status==='unsupported'?'未対応バージョン':next.reader?.status==='error'?'読取を確認してください':next.game.online?next.game.players.length?'接続中':'ロビーを待っています':'起動・参加を待っています';
  $('#game-dot').classList.toggle('online',next.game.online);$('#game-count').textContent=next.game.players.length+'人';
  const gameMode=/SNR|SuperNewRoles/.test(next.game.modVersion)?'SNR':next.game.modVersion.includes('Nebula')?'Nebula':'Among Us';
  $('#game-version').textContent=demo?'表示確認用の架空メンバー':next.game.online&&next.game.players.length&&!/待ち|同名|確認/.test(next.reader?.message||'')?gameMode+' · 色を自動取得しています':next.reader?.message||'Among Usの起動を待っています';
  const discordStatus=next.discord.status;
  $('#discord-status').textContent=demo?'デモ表示中':auth.busy?'接続しています':auth.needsAuthorization?'許可が必要です':discordStatus.startsWith('切断しました')?'切断しています':discordStatus.length>25?'接続を確認してください':discordStatus;
  $('#discord-dot').classList.toggle('online',demo||discordStatus==='接続中');$('#voice-count').textContent=next.discord.members.length+'人';
  $('#discord-channel').textContent=next.discord.channel||(auth.busy?discordStatus:auth.needsAuthorization?'接続画面から許可をやり直してください':discordStatus.length>25?discordStatus:'サーバーの通話に参加してください');
  $('#auth-summary').textContent=auth.needsAuthorization?'許可が無効になっています。Discordで許可をやり直してください。':auth.busy?'Discordへの接続を進めています。許可画面が開いた場合は内容を確認してください。':auth.saved?(auth.autoConnect?'認証を保存済みです。次回の起動時も自動接続します。':'認証を保存済みです。「保存した認証で接続」から再開できます。'):auth.storageAvailable?'初回だけブラウザーでDiscordの許可を行います。保存すると、次回から自動接続します。':'認証の保存はWindowsデスクトップ版で利用できます。';
  $('#connect-discord').hidden=auth.saved&&!auth.needsAuthorization;$('#connect-discord').textContent=auth.needsAuthorization?'Discordの許可をやり直す':'Discordと連携・許可';
  $('#reconnect-discord').hidden=!auth.saved||auth.needsAuthorization;$('#reconnect-discord').textContent=auth.autoConnect?'再接続':'保存した認証で接続';
  $('#forget-discord').hidden=!auth.saved;$('#forget-discord').disabled=auth.busy;$('#disconnect-discord').hidden=!(auth.busy||auth.autoConnect||next.discord.channel||discordStatus==='通話への参加を待っています');
  $('#reconnect-discord').disabled=auth.busy;$('#connect-discord').disabled=auth.busy;$('#remember-discord').disabled=!auth.storageAvailable||auth.busy;
  if(!auth.storageAvailable)$('#remember-discord').checked=false;
  if(authUiSaved!==auth.saved){$('#discord-form').elements.channelId.value=auth.channelId||'';authUiSaved=auth.saved;}
  $('#notice').hidden=true;$('#notice').textContent='';$('#demo').textContent=demo?'実際の接続に戻る':'デモを試す';
  for(const key of settingKeys)$('#'+key).disabled=false;
  $('.life-help').textContent=!demo&&next.game.online&&!next.game.lifeTracking?'会議情報を確認できないため、死亡マークの自動更新を保留しています。':'死亡は会議開始時、吊られは会議終了後の追放確定時に更新します。途中起動時は次の会議から同期します。';
  $('#overlay-url').value=next.overlayUrl;
  const count=next.rows.filter(row=>row.visible&&row.player&&row.member).length;$('#member-count').textContent=count;
  $('#mapping-status').textContent=next.unmapped?next.unmapped+'人が未設定です':count?'保存したメンバーを表示中':'接続後にメンバーを対応づけます';
  const presetSignature=options=>options.map(option=>[option.value,option.textContent]);
  if(JSON.stringify(presetSignature([...$('#presets').options]))!==JSON.stringify(next.presets.map(p=>[p.id,p.name])))$('#presets').replaceChildren(...next.presets.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;return option;}));$('#presets').value=next.preset.id;
  const missing=next.rows.filter(row=>!row.player||!row.member);$('#unresolved').hidden=!missing.length||demo;$('#unresolved').textContent='保存した'+missing.length+'人がゲームまたは通話に見つかりません。名前の変更や退出を確認してください。';
  const key=JSON.stringify([next.mode,next.game.players,next.discord.members.map(m=>({id:m.id,name:m.name})),next.preset.id]);
  if(key!==lastKey&&!document.querySelector('#mapping-rows :focus')){table();lastKey=key;}
  $('#create-preset').disabled=demo;$('#preset-name').disabled=demo;
  updateNextStep(count);renderPreview();updateSaveState();
}
async function toggleDemo(){if(state.mode!=='demo'&&(dirty||settingsDirty)){toast('変更を保存するか、元に戻してから切り替えてください。');return;}try{receive(await post('/api/demo',{enabled:state.mode!=='demo'}));}catch(error){toast(error.message);}}
async function copyUrl(){try{if(window.crewLink?.copyOverlayUrl)await window.crewLink.copyOverlayUrl();else await navigator.clipboard.writeText(state.overlayUrl);toast('OBS用URLをコピーしました。');}catch{toast('URL欄を選択してコピーしてください。');$('#overlay-url').focus();$('#overlay-url').select();}}
$('#demo').onclick=toggleDemo;$('#copy-url').onclick=copyUrl;
$('#preview-actual').onclick=()=>{const actual=$('#preview-viewport').classList.toggle('actual');$('#preview-actual').setAttribute('aria-pressed',String(actual));$('#preview-actual').textContent=actual?'全体を表示':'実寸で確認';$('#preview-scale-label').hidden=actual;fitPreview();};
$('#next-action').onclick=()=>{const action=$('#next-action').dataset.action;if(action==='demo')toggleDemo();else if(action==='copy')copyUrl();else openView(action);};
$('#save').onclick=async()=>{if(saving||state.mode==='demo')return;saving=true;const revision=editRevision;updateSaveState();try{const result=await post('/api/save',{links:draft,settings:settings()});if(revision===editRevision){dirty=false;settingsDirty=false;}receive(result);toast('設定を保存し、OBSに反映しました。');}catch(error){toast(error.message);}finally{saving=false;updateSaveState();}};
$('#discard').onclick=()=>{dirty=false;settingsDirty=false;lastKey='';receive(state);toast('未保存の変更を元に戻しました。');};
$('#presets').onchange=async event=>{if(dirty||settingsDirty){event.target.value=state.preset.id;toast('変更を保存するか、元に戻してから切り替えてください。');return;}try{lastKey='';receive(await post('/api/presets/select',{id:event.target.value}));}catch(error){toast(error.message);}};
$('#create-preset').onclick=async()=>{try{if(state.mode==='demo')return;if(!$('#preset-name').value.trim())throw Error('プリセット名を入力してください。');await post('/api/save',{links:draft,settings:settings()});const result=await post('/api/presets/create',{name:$('#preset-name').value});dirty=false;settingsDirty=false;lastKey='';receive(result);$('#preset-name').value='';$('.preset-create').open=false;toast('新しいプリセットを保存しました。');}catch(error){toast(error.message);}};
for(const key of settingKeys)$('#'+key).oninput=()=>{settingsDirty=true;editRevision++;updateOutputs();renderPreview();updateSaveState();};
$('#discord-form').onsubmit=async event=>{event.preventDefault();if(dirty||settingsDirty){toast('変更を保存するか、元に戻してから接続してください。');return;}const options=Object.fromEntries(new FormData(event.target));options.remember=$('#remember-discord').checked;$('#connect-discord').disabled=true;try{receive(await post('/api/discord/connect',options));toast('Discordと連携しました。');}catch(error){toast(error.message);}finally{$('#connect-discord').disabled=state.discord.auth.busy;}};
$('#disconnect-discord').onclick=async()=>{try{receive(await post('/api/discord/disconnect',{}));}catch(error){toast(error.message);}};
$('#reconnect-discord').onclick=async()=>{if(dirty||settingsDirty){toast('変更を保存するか、元に戻してから接続してください。');return;}try{receive(await post('/api/discord/reconnect',{}));}catch(error){toast(error.message);}};
$('#forget-discord').onclick=async()=>{try{receive(await post('/api/discord/forget',{}));$('#discord-form').reset();toast('このPCに保存したDiscordの認証を削除しました。');}catch(error){toast(error.message);}};
window.addEventListener('beforeunload',event=>{if(state?.mode!=='demo'&&(dirty||settingsDirty)){event.preventDefault();event.returnValue='';}});
try{const bootstrap=await(await fetch('/api/bootstrap')).json();token=bootstrap.token;receive(bootstrap);const stream=new EventSource('/api/events');stream.onmessage=event=>receive(JSON.parse(event.data));stream.onerror=()=>{$('#notice').hidden=false;$('#notice').textContent='アプリとの接続が切れました。起動状態を確認してください。';};}catch{toast('アプリに接続できません。起動し直してください。');}
