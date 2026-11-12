import {renderCrew} from './render.js';
import {appendCharacter} from './icons.js';
import {setupUpdateUI} from './updates-ui.js';
const $=selector=>document.querySelector(selector);
let state,token,draft=[],dirty=false,settingsDirty=false,saving=false,creatingPreset=false,editRevision=0,lastKey='',authUiSaved,layoutSource;
const pendingDrafts=new Map();
setupUpdateUI({canInstall:()=>!!state&&!dirty&&!settingsDirty&&!saving&&!creatingPreset&&!pendingDrafts.size});
const draftKey=s=>s.mode+':'+s.preset.id;
const views=['preview','mapping','connections'];
const settingKeys=['displaySource','size','gap','characterScale','badgeSize','nameSize','colorBackground','bounceSpeaking','showCharacter','horizontalNamePosition','verticalNamePosition','orientation','showStatus','showNames','dimIdle'];
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
function settings(){return {displaySource:$('#displaySource').value,size:Number($('#size').value),gap:Number($('#gap').value),characterScale:Number($('#characterScale').value),badgeSize:Number($('#badgeSize').value),nameSize:Number($('#nameSize').value),colorBackground:$('#colorBackground').checked,bounceSpeaking:$('#bounceSpeaking').checked,showCharacter:$('#showCharacter').checked,horizontalNamePosition:$('#horizontalNamePosition').value,verticalNamePosition:$('#verticalNamePosition').value,orientation:$('#orientation').value,showStatus:$('#showStatus').checked,showNames:$('#showNames').checked,dimIdle:$('#dimIdle').checked};}
function updateOutputs(){$('#size-value').textContent=$('#size').value+' px';$('#gap-value').textContent=$('#gap').value+' px';$('#characterScale-value').textContent=$('#characterScale').value+' %';$('#badgeSize-value').textContent=$('#badgeSize').value+' %';$('#nameSize-value').textContent=$('#nameSize').value+' px';}
function syncSettings(values=state.preset.settings){for(const [key,value]of Object.entries(values)){const element=$('#'+key);if(element.type==='checkbox')element.checked=value;else element.value=value;}updateOutputs();}
function fitPreview(){const viewport=$('#preview-viewport'),crew=$('#preview-crew');if(viewport.classList.contains('actual'))return;if(!viewport.clientWidth||!crew.offsetWidth)return;const scale=Math.min(1,(viewport.clientWidth-40)/crew.offsetWidth,(viewport.clientHeight-34)/Math.max(1,crew.offsetHeight));crew.style.setProperty('--preview-scale',String(scale));$('#preview-scale-label').hidden=!crew.children.length||scale>=.99;}
new ResizeObserver(fitPreview).observe($('#preview-viewport'));
function renderPreview(){
  if(!state)return;
  const rows=settings().displaySource==='game'?(state.game.displayPlayers??state.game.players).map(player=>({gameKey:player.key,visible:true,player,member:null})):draft.map(link=>({...link,player:(state.game.displayPlayers??state.game.players).find(p=>p.key===link.gameKey)||null,member:state.discord.members.find(m=>m.id===link.discordId)||null}));
  const count=renderCrew($('#preview-crew'),{...state,rows,preset:{...state.preset,settings:settings()}});
  $('#preview-viewport').classList.toggle('portrait',settings().orientation==='vertical');
  $('#preview-empty').hidden=count>0;
  $('#preview-empty-title').textContent=settings().displaySource==='game'?'Among Usのロビーに参加してください':'ここに配信メンバーが並びます';
  $('#preview-empty-description').textContent=settings().displaySource==='game'?'参加者を自動表示します。':'ゲームとDiscordを接続し、メンバーを対応づけてください。';
  const badge=$('#preview-mode');badge.textContent=state.mode==='demo'?'デモ表示':dirty||settingsDirty?'未保存のプレビュー':'本番表示';badge.classList.toggle('demo',state.mode==='demo');
  fitPreview();
}
function updateSaveState(){
  const pending=dirty||settingsDirty,demo=state?.mode==='demo';
  for(const key of settingKeys)$('#'+key).disabled=creatingPreset;
  const gameOnly=$('#displaySource').value==='game';
  $('.status-grid').classList.toggle('game-only',gameOnly);$('.connection-grid').classList.toggle('game-only',gameOnly);
  $('#source-help').textContent=gameOnly?'ゲーム内の名前とクルーを自動表示':'Discord画像とゲームの色を合わせて表示';
  $('#size-label').textContent=gameOnly?'クルーの大きさ':'Discordアイコンの大きさ';
  $('#horizontalNamePosition').closest('label').hidden=$('#orientation').value!=='horizontal';
  $('#verticalNamePosition').closest('label').hidden=$('#orientation').value!=='vertical';
  $('#mapping-description').textContent=gameOnly?'ゲームの参加者を自動で表示します。':'ゲーム内の名前にDiscordの参加者を選びます。';
  $('#discord-connection-note').textContent=gameOnly?'使用しない（必要な場合だけ開く）':'サーバーの通話に参加してください';
  if(layoutSource!==$('#displaySource').value){$('#discord-connection').open=!gameOnly;layoutSource=$('#displaySource').value;}

  for(const key of ['bounceSpeaking','dimIdle','showCharacter']){$('#'+key).disabled=creatingPreset||gameOnly;$('#'+key).closest('label').hidden=gameOnly;}
  $('#game-only-note').hidden=!gameOnly;$('#mapping-table').hidden=gameOnly;$('#mapping-hint').hidden=gameOnly;
  if(creatingPreset)for(const node of document.querySelectorAll('#mapping-rows input,#mapping-rows select,#mapping-rows button'))node.disabled=true;
  $('#create-preset').disabled=demo||saving;$('#preset-name').disabled=demo||saving;$('#presets').disabled=saving;$('#demo').disabled=creatingPreset;$('#clear-data').disabled=creatingPreset;
  $('#save').disabled=!pending||saving;$('#discard').hidden=!pending;$('#discard').disabled=saving;
  $('#save-state').classList.toggle('dirty',pending);
  $('#save-label').textContent=saving?'保存しています':pending?'未保存の変更があります':'保存済み';
  $('#save-description').textContent=pendingDrafts.size?'別のプリセットに未保存の編集があります。元のプリセットに戻ると復元します。':demo?(pending?'見た目だけを保存します。実際の対応づけは維持します。':'見た目は保存済みです。デモのメンバーは保存しません。'):pending?'保存するとOBSにも反映されます':'次回も同じ設定を使えます';
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
    const none=document.createElement('option');none.value='';none.textContent=link?'対応づけを解除':'参加者を選択';select.append(none);
    const members=[...state.discord.members];if(link&&!members.some(m=>m.id===link.discordId))members.push({id:link.discordId,name:(link.label||link.gameName||'保存済み参加者')+'（通話に不在）'});
    for(const member of members){const option=document.createElement('option');option.value=member.id;option.textContent=member.name;select.append(option);}select.value=link?.discordId||'';select.disabled=demo;
    const memberCell=document.createElement('td');memberCell.append(select);tr.append(memberCell);
    function unlink(){draft=draft.filter(l=>l.gameKey!==key);edited();table();toast('対応づけを解除しました。「変更を保存」で確定します。');}
    if(link){const remove=document.createElement('button');remove.type='button';remove.className='unlink-button';remove.textContent='解除';remove.setAttribute('aria-label',displayName+'の対応づけを解除');remove.disabled=demo;remove.onclick=unlink;memberCell.append(remove);}
    const label=document.createElement('input');label.value=link?.label||'';label.placeholder='Discord名を使用';label.maxLength=80;label.disabled=demo||!select.value;label.setAttribute('aria-label',displayName+'の配信用の名前');const labelCell=document.createElement('td');labelCell.append(label);tr.append(labelCell);
    const visible=document.createElement('input');visible.type='checkbox';visible.checked=link?.visible!==false;visible.disabled=demo||!select.value;visible.setAttribute('aria-label',displayName+'を表示');const visibleCell=document.createElement('td');visibleCell.append(visible);tr.append(visibleCell);
    function ensure(){let item=draft.find(l=>l.gameKey===key);if(!item){item={gameKey:key,gameName:player?.name||'',discordId:select.value,label:label.value,visible:visible.checked};draft.push(item);}if(player)item.gameName=player.name;return item;}
    select.onchange=()=>{
      const previous=draft.find(l=>l.gameKey===key);
      if(select.value&&draft.some(l=>l.gameKey!==key&&l.discordId===select.value)){toast('そのDiscord参加者は別のプレイヤーに設定されています。');select.value=previous?.discordId||'';return;}
      if(!select.value){unlink();return;}ensure().discordId=select.value;
      label.disabled=demo||!select.value;visible.disabled=demo||!select.value;detail.textContent=select.value?'対応づけ済み':'Discord参加者を選択';edited();
    };
    label.oninput=()=>{if(select.value){ensure().label=label.value;edited();}};
    visible.onchange=()=>{if(select.value){ensure().visible=visible.checked;edited();}};
    const controls=document.createElement('td');
    for(const [text,offset]of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.textContent=text;button.className='order-button';button.setAttribute('aria-label',displayName+(offset<0?'を前へ':'を後ろへ'));const index=draft.findIndex(l=>l.gameKey===key);button.disabled=demo||index<0||index+offset<0||index+offset>=draft.length;button.onclick=()=>{[draft[index],draft[index+offset]]=[draft[index+offset],draft[index]];edited();table();};controls.append(button);}tr.append(controls);return tr;
  }));
}
function receive(next){
  if(state?.instanceId===next.instanceId&&Number.isFinite(next.stateVersion)&&next.stateVersion<state.stateVersion)return;
  const changed=state?.preset.id!==next.preset.id,modeChanged=state?.mode!==next.mode;
  if(state&&(changed||modeChanged)&&(dirty||settingsDirty))pendingDrafts.set(draftKey(state),{draft:structuredClone(draft),settings:settings(),dirty,settingsDirty,revision:editRevision});
  state=next;
  for(const key of pendingDrafts.keys())if(!next.presets.some(p=>key==='live:'+p.id||key==='demo:'+p.id))pendingDrafts.delete(key);
  if(changed||modeChanged){dirty=false;settingsDirty=false;lastKey='';}
  if((changed||modeChanged)&&pendingDrafts.has(draftKey(next))){const saved=pendingDrafts.get(draftKey(next));pendingDrafts.delete(draftKey(next));draft=saved.draft;dirty=saved.dirty;settingsDirty=saved.settingsDirty;syncSettings(saved.settings);editRevision++;toast('このプリセットの未保存の編集を復元しました。');}
  if(!dirty)draft=structuredClone(next.mode==='demo'?next.game.players.map((player,i)=>({gameKey:player.key,discordId:'demo-user-'+i,label:'',visible:true})):next.preset.links);
  if(!settingsDirty)syncSettings();
  const demo=next.mode==='demo',auth=next.discord.auth;
  $('#game-status').textContent=demo?'デモ表示中':next.reader?.status==='unsupported'?'未対応バージョン':next.reader?.status==='error'?'読取を確認してください':next.game.online?next.game.players.length?'接続中':'ロビーを待っています':'起動・参加を待っています';
  $('#game-dot').classList.toggle('online',next.game.online);$('#game-count').textContent=next.game.players.length+'人';
  const gameMode=/SNR|SuperNewRoles/.test(next.game.modVersion)?'SNR':next.game.modVersion.includes('Nebula')?'Nebula':'Among Us';
  $('#game-version').textContent=demo?'表示確認用の架空メンバー':next.game.online&&next.game.players.length&&!/待ち|同名|確認/.test(next.reader?.message||'')?gameMode+' · 色を自動取得しています':next.reader?.message||'Among Usの起動を待っています';
  const discordStatus=next.discord.status,discordOptional=next.preset.settings.displaySource==='game';
  $('#discord-status').textContent=discordOptional?'使用しない':demo?'デモ表示中':auth.busy?'接続しています':auth.needsAuthorization?'許可が必要です':discordStatus.startsWith('切断しました')?'切断しています':discordStatus.length>25?'接続を確認してください':discordStatus;
  $('#discord-dot').classList.toggle('online',!discordOptional&&(demo||discordStatus==='接続中'));$('#voice-count').textContent=discordOptional?'—':next.discord.members.length+'人';
  $('#discord-channel').textContent=discordOptional?'Among Usのみで表示中':next.discord.channel||(auth.busy?discordStatus:auth.needsAuthorization?'接続画面から許可をやり直してください':discordStatus.length>25?discordStatus:'サーバーの通話に参加してください');
  $('#auth-summary').textContent=discordOptional?'現在の表示モードではDiscordの連携は不要です。Discord画像や発言検出を使う場合は、表示モードをDiscord連携に戻してください。':auth.failure?discordStatus:auth.needsAuthorization?discordStatus+' Discordで許可をやり直してください。':auth.busy?'Discordへの接続を進めています。許可画面が開いた場合は内容を確認してください。':auth.saved?(auth.autoConnect?'認証を保存済みです。次回の起動時も自動接続します。':'認証を保存済みです。「保存した認証で接続」から再開できます。'):auth.storageAvailable?'初回だけブラウザーでDiscordの許可を行います。保存すると、次回から自動接続します。':'認証の保存はWindowsデスクトップ版で利用できます。';
  $('#connect-discord').hidden=auth.saved&&!auth.needsAuthorization;$('#connect-discord').textContent=auth.needsAuthorization?'Discordの許可をやり直す':'Discordと連携・許可';
  $('#reconnect-discord').hidden=!auth.saved||auth.needsAuthorization;$('#reconnect-discord').textContent=auth.autoConnect?'再接続':'保存した認証で接続';
  $('#forget-discord').hidden=!auth.saved;$('#forget-discord').disabled=auth.busy;$('#disconnect-discord').hidden=!(auth.busy||auth.autoConnect||next.discord.channel||discordStatus==='通話への参加を待っています');
  $('#reconnect-discord').disabled=auth.busy;$('#connect-discord').disabled=auth.busy;$('#remember-discord').disabled=!auth.storageAvailable||auth.busy;
  if(!auth.storageAvailable)$('#remember-discord').checked=false;
  if(authUiSaved!==auth.saved){$('#discord-form').elements.channelId.value=auth.channelId||'';authUiSaved=auth.saved;}
  $('#notice').hidden=true;$('#notice').textContent='';$('#demo').textContent=demo?'実際の接続に戻る':'デモを試す';
  for(const key of settingKeys)$('#'+key).disabled=false;
  $('.life-help').textContent=!demo&&next.game.online&&!next.game.lifeTracking?'会議情報を確認できないため、死亡マークの自動更新を保留しています。':'死亡は会議開始時、追放は会議終了後の確定時に更新します。NebulaのMADMATE巻き添えと、SNRの道連れ・後追いは次の会議開始時に反映します。途中起動時は次の会議から同期します。';
  $('#overlay-url').value=next.overlayUrl;
  const count=next.rows.filter(row=>row.visible&&row.player&&(next.preset.settings.displaySource==='game'||row.member)).length;$('#member-count').textContent=count;
  $('#mapping-status').textContent=next.preset.settings.displaySource==='game'?'ゲーム内の名前で自動表示':next.unmapped?next.unmapped+'人が未設定です':count?'保存したメンバーを表示中':'接続後にメンバーを対応づけます';
  const presetSignature=options=>options.map(option=>[option.value,option.textContent]);
  if(JSON.stringify(presetSignature([...$('#presets').options]))!==JSON.stringify(next.presets.map(p=>[p.id,p.name])))$('#presets').replaceChildren(...next.presets.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;return option;}));$('#presets').value=next.preset.id;
  const missing=next.rows.filter(row=>!row.player||!row.member);$('#unresolved').hidden=!missing.length||demo||next.preset.settings.displaySource==='game';$('#unresolved').textContent='保存した'+missing.length+'人がゲームまたは通話に見つかりません。名前の変更や退出を確認してください。';
  const key=JSON.stringify([next.mode,next.game.players,next.discord.members.map(m=>({id:m.id,name:m.name})),next.preset.id,draft]);
  if(key!==lastKey&&!document.querySelector('#mapping-rows :focus')){table();lastKey=key;}
  $('#create-preset').disabled=demo;$('#preset-name').disabled=demo;
  renderPreview();updateSaveState();
}
async function toggleDemo(){if(dirty||settingsDirty||saving){toast('変更を保存するか、元に戻してから切り替えてください。');return;}try{receive(await post('/api/demo',{enabled:state.mode!=='demo'}));}catch(error){toast(error.message);}}
async function copyUrl(){try{if(window.crewLink?.copyOverlayUrl)await window.crewLink.copyOverlayUrl();else await navigator.clipboard.writeText(state.overlayUrl);toast('OBS用URLをコピーしました。');}catch{toast('URL欄を選択してコピーしてください。');$('#overlay-url').focus();$('#overlay-url').select();}}
$('#demo').onclick=toggleDemo;$('#copy-url').onclick=copyUrl;
$('#preview-actual').onclick=()=>{const actual=$('#preview-viewport').classList.toggle('actual');$('#preview-actual').setAttribute('aria-pressed',String(actual));$('#preview-actual').textContent=actual?'全体を表示':'実寸で確認';$('#preview-scale-label').hidden=actual;fitPreview();};

$('#save').onclick=async()=>{if(saving)return;saving=true;const revision=editRevision,target=draftKey(state),presetId=state.preset.id;updateSaveState();try{const result=await post('/api/save',state.mode==='demo'?{presetId,settings:settings()}:{presetId,links:draft,settings:settings()});if(target===draftKey(state)&&revision===editRevision){dirty=false;settingsDirty=false;pendingDrafts.delete(target);}else if(pendingDrafts.get(target)?.revision===revision)pendingDrafts.delete(target);receive(result);toast('プリセットの設定を保存しました。選択中の設定がOBSに反映されます。');}catch(error){toast(error.message);}finally{saving=false;updateSaveState();}};
$('#discard').onclick=()=>{dirty=false;settingsDirty=false;lastKey='';receive(state);toast('未保存の変更を元に戻しました。');};
$('#presets').onchange=async event=>{if(dirty||settingsDirty){event.target.value=state.preset.id;toast('変更を保存するか、元に戻してから切り替えてください。');return;}try{lastKey='';receive(await post('/api/presets/select',{id:event.target.value}));}catch(error){toast(error.message);}};
$('#create-preset').onclick=async()=>{if(saving||state.mode==='demo')return;const name=$('#preset-name').value.trim();if(!name){toast('プリセット名を入力してください。');return;}const presetId=state.preset.id,target=draftKey(state);saving=true;creatingPreset=true;updateSaveState();try{await post('/api/save',{presetId,links:draft,settings:settings()});const result=await post('/api/presets/create',{name,presetId});pendingDrafts.delete(target);dirty=false;settingsDirty=false;lastKey='';receive(result);$('#preset-name').value='';$('.preset-create').open=false;toast('新しいプリセットを保存しました。');}catch(error){toast(error.message);}finally{creatingPreset=false;saving=false;table();updateSaveState();}};
for(const key of settingKeys)$('#'+key).oninput=()=>{settingsDirty=true;editRevision++;updateOutputs();renderPreview();updateSaveState();};
$('#discord-form').onsubmit=async event=>{event.preventDefault();if(dirty||settingsDirty){toast('変更を保存するか、元に戻してから接続してください。');return;}const options=Object.fromEntries(new FormData(event.target));options.remember=$('#remember-discord').checked;$('#connect-discord').disabled=true;try{receive(await post('/api/discord/connect',options));toast('Discordと連携しました。');}catch(error){toast(error.message);}finally{$('#connect-discord').disabled=state.discord.auth.busy;}};
$('#disconnect-discord').onclick=async()=>{try{receive(await post('/api/discord/disconnect',{}));}catch(error){toast(error.message);}};
$('#reconnect-discord').onclick=async()=>{if(dirty||settingsDirty){toast('変更を保存するか、元に戻してから接続してください。');return;}try{receive(await post('/api/discord/reconnect',{}));}catch(error){toast(error.message);}};
$('#forget-discord').onclick=async()=>{try{receive(await post('/api/discord/forget',{}));$('#discord-form').reset();toast('このPCに保存したDiscordの認証を削除しました。');}catch(error){toast(error.message);}};
$('#clear-data').onclick=async()=>{if(!window.confirm('このPCの対応づけ・見た目・プリセット・保存認証をすべて削除します。よろしいですか？'))return;try{const result=await post('/api/data/clear',{});pendingDrafts.clear();dirty=false;settingsDirty=false;lastKey='';receive(result);$('#discord-form').reset();toast('このPCに保存した設定と認証を削除しました。');}catch(error){toast(error.message);}};
window.addEventListener('beforeunload',event=>{if(dirty||settingsDirty||pendingDrafts.size){event.preventDefault();event.returnValue='';}});
try{const bootstrap=await(await fetch('/api/bootstrap')).json();token=bootstrap.token;receive(bootstrap);const stream=new EventSource('/api/events');stream.onmessage=event=>receive(JSON.parse(event.data));stream.onerror=()=>{$('#notice').hidden=false;$('#notice').textContent='アプリとの接続が切れました。起動状態を確認してください。';};}catch{toast('アプリに接続できません。起動し直してください。');}
