import {cleanStreamkitUrl} from './streamkit.js';
import {renderCrew} from './render.js';
import {appendCharacter} from './icons.js';
import {setupSettingsTransfer} from './settings-transfer.js';
import {setupPresetManager} from './preset-manager.js';
import {setupUpdateUI} from './updates-ui.js';
const $=selector=>document.querySelector(selector);
let settingsTransferBusy=false;
let state,token,streamkitDraft='',draft=[],dirty=false,settingsDirty=false,saving=false,creatingPreset=false,memberRevision=0,displayRevision=0,lastKey='',activeView='preview',previewKey='',previewRequest=0,previewTimer,previewMode='';
let streamkitNameDraft='',streamkitFormId='',streamkitFormRevision=0,streamkitDirty=false,streamkitSaving=false,streamkitEditorRevision=0,streamkitBaseActive='';
let memberFilter='all',memberDragKey='';
let memberBase=[],memberConflict=false,memberSaving=false,memberSaveTimer=null,memberSaveError='',memberComposing=false;
const pendingDrafts=new Map();
setupUpdateUI({notify:message=>toast(message),canInstall:()=>!!state&&!settingsTransferBusy&&!dirty&&!memberSaving&&!settingsDirty&&!saving&&!streamkitSaving&&!streamkitDirty&&!creatingPreset&&!pendingDrafts.size});
const memberKey=s=>'members:'+s.mode+':'+s.preset.id;
const displayKey=s=>'display:'+s.displayPreset.id;
const views=['preview','mapping','connections'];
const settingKeys=['displaySource','size','gap','characterScale','badgeSize','nameSize','colorBackground','bounceSpeaking','showCharacter','horizontalNamePosition','verticalNamePosition','orientation','showStatus','showNames','dimIdle','avatarShape','nameOpacity','motionHeight'];
for(const node of document.querySelectorAll('[data-character]'))appendCharacter(node,{color:node.dataset.character,colorKnown:true,lifeState:'alive'});
function openView(id,{focus=false}={}){
  if(!views.includes(id))id='preview';activeView=id;
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
async function post(url,data){const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':token},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{code:result.code});return result;}
function settings(){return {displaySource:$('#displaySource').value,size:Number($('#size').value),gap:Number($('#gap').value),characterScale:Number($('#characterScale').value),badgeSize:Number($('#badgeSize').value),nameSize:Number($('#nameSize').value),colorBackground:$('#colorBackground').checked,bounceSpeaking:$('#bounceSpeaking').checked,showCharacter:$('#showCharacter').checked,horizontalNamePosition:$('#horizontalNamePosition').value,verticalNamePosition:$('#verticalNamePosition').value,orientation:$('#orientation').value,showStatus:$('#showStatus').checked,showNames:$('#showNames').checked,dimIdle:$('#dimIdle').checked,avatarShape:$('#avatarShape').value,nameOpacity:Number($('#nameOpacity').value),motionHeight:Number($('#motionHeight').value)};}
function updateOutputs(){$('#size-value').textContent=$('#size').value+' px';$('#gap-value').textContent=$('#gap').value+' px';$('#characterScale-value').textContent=$('#characterScale').value+' %';$('#badgeSize-value').textContent=$('#badgeSize').value+' %';$('#nameSize-value').textContent=$('#nameSize').value+' px';$('#nameOpacity-value').textContent=$('#nameOpacity').value+' %';$('#motionHeight-value').textContent=$('#motionHeight').value+' px';}
function syncSettings(values=state.preset.settings){for(const [key,value]of Object.entries(values)){const element=$('#'+key);if(!element)continue;if(element.type==='checkbox')element.checked=value;else element.value=value;}updateOutputs();}
function fitPreview(){const viewport=$('#preview-viewport'),crew=$('#preview-crew');if(!viewport.clientWidth||!crew.offsetWidth)return;const scale=Math.min(1,(viewport.clientWidth-40)/crew.offsetWidth,(viewport.clientHeight-34)/Math.max(1,crew.offsetHeight));crew.style.setProperty('--preview-scale',String(scale));$('#preview-scale-label').hidden=!crew.children.length||scale>=.99;}
new ResizeObserver(fitPreview).observe($('#preview-viewport'));
function renderPreview(){
  if(!state)return;
  const value=settings(),gameOnly=value.displaySource==='game',target=$('#preview-crew');
  if(previewMode!==value.displaySource){target.replaceChildren();document.querySelector('#preview-generated-style')?.remove();previewKey='';previewRequest++;previewMode=value.displaySource;}
  $('#preview-viewport').classList.toggle('portrait',value.orientation==='vertical');
  $('#preview-mode').textContent=state.mode==='demo'?'デモ表示':dirty||settingsDirty?'未保存の見本':gameOnly?'ゲーム表示':'仮のアバター';$('#preview-mode').classList.toggle('demo',state.mode==='demo');
  $('#preview-note').textContent=gameOnly?'ゲーム内の名前とクルーを表示します。':'Discord画像は見本です。実際の表示はOBSで確認。';
  target.classList.toggle('Voice_voiceStates__scl',!gameOnly);
  if(gameOnly){
    previewRequest++;clearTimeout(previewTimer);previewKey='';
    const players=state.mode==='demo'?state.game.displayPlayers.slice(0,Number($('#demo-count').value)):state.game.displayPlayers;const rows=players.map(player=>({gameKey:player.key,visible:true,player,member:null}));
    target.style.width='';target.style.height='';const count=renderCrew(target,{...state,rows,preset:{...state.preset,settings:value}});$('#preview-empty').hidden=count>0;
    $('#preview-empty-title').textContent='Among Usのロビーに参加してください';$('#preview-empty-description').textContent='参加者を自動表示します。デモでも見た目を試せます。';fitPreview();return;
  }
  const key=JSON.stringify([state.mode,$('#demo-count').value,value,draft,state.game.displayPlayers]);if(key===previewKey)return;previewKey=key;clearTimeout(previewTimer);const sequence=++previewRequest;
  previewTimer=setTimeout(async()=>{
    try{
      const result=await post('/api/preview',{settings:value,links:draft,sampleCount:Number($('#demo-count').value)});if(sequence!==previewRequest||previewKey!==key)return;
      let sheet=$('#preview-generated-style');if(!sheet){sheet=document.createElement('style');sheet.id='preview-generated-style';document.head.append(sheet);}sheet.textContent=result.css;
      target.className='crew-row Voice_voiceStates__scl';target.style.width=result.width+'px';target.style.height=result.height+'px';
      target.replaceChildren(...result.rows.map((row,index)=>{
        const item=document.createElement('li');item.className='Voice_voiceState__scl';
        const avatar=document.createElement('img');avatar.className='Voice_avatar__scl';avatar.alt='仮のアバター';
        const letter=String(index+1),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#405971"/><text x="80" y="104" text-anchor="middle" fill="#edf6ff" font-size="76" font-family="sans-serif">${letter}</text></svg>`;
        avatar.src='data:image/svg+xml,'+encodeURIComponent(svg)+'#/avatars/'+row.discordId+'/';
        const user=document.createElement('div');user.className='Voice_user__scl';const name=document.createElement('span');name.className='Voice_name__scl';name.textContent=row.label||row.player?.name||row.gameName||'登録済みメンバー';user.append(name);item.append(avatar,user);return item;
      }));
      applyPreviewSpeaking();$('#preview-empty').hidden=result.rows.length>0;$('#preview-empty-title').textContent=state.mode==='demo'?'デモを準備しています':'表示対象のメンバーがいません';$('#preview-empty-description').textContent='ゲーム内にいて対応づけ済みの人を自動表示します。';fitPreview();
    }catch{if(sequence!==previewRequest)return;$('#preview-empty').hidden=false;$('#preview-empty-title').textContent='表示の見本を作成できません';$('#preview-empty-description').textContent='設定とアプリの起動状態を確認してください。';previewKey='';}
  },120);
}
function applyPreviewSpeaking(){document.querySelectorAll('#preview-crew .Voice_avatar__scl').forEach((e,i)=>e.classList.toggle('Voice_avatarSpeaking__scl',i===0&&$('#preview-speaking').checked));}
$('#preview-speaking').onchange=applyPreviewSpeaking;
function updateSaveState(){
  const pending=dirty||settingsDirty||streamkitDirty,demo=state?.mode==='demo';
  updateStreamkitState();
  for(const key of settingKeys)$('#'+key).disabled=creatingPreset;
  const gameOnly=$('#displaySource').value==='game';
  $('.status-grid').classList.toggle('game-only',false);$('.connection-grid').classList.toggle('game-only',true);
  $('#size-label').textContent=gameOnly?'クルーの大きさ':'Discordアイコンの大きさ';
  $('#horizontalNamePosition').closest('label').hidden=$('#orientation').value!=='horizontal';$('#verticalNamePosition').closest('label').hidden=$('#orientation').value!=='vertical';
  $('#mapping-description').textContent=gameOnly?'この方式ではゲームの参加者を自動で表示します。':'DiscordユーザーIDで対応づけ・自動保存';
  for(const key of ['bounceSpeaking','dimIdle','showCharacter','avatarShape','motionHeight']){$('#'+key).disabled=creatingPreset||gameOnly;$('#'+key).closest('label').hidden=gameOnly;}
  $('#motionHeight').closest('label').hidden=gameOnly||!$('#bounceSpeaking').checked;$('#member-filter-bar').hidden=gameOnly;$('#member-filter').disabled=demo||creatingPreset;
  $('#game-only-note').hidden=!gameOnly;$('#mapping-table').hidden=gameOnly;$('#mapping-hint').hidden=gameOnly;
  $('#preview-speaking-label').hidden=gameOnly;$('#streamkit-panel').hidden=false;$('#obs-setup-panel').hidden=gameOnly;$('#game-overlay-bar').hidden=!gameOnly;$('#open-overlay').hidden=!gameOnly;
  $('#copy-game-url').hidden=!gameOnly;$('#obs-toggle').hidden=gameOnly&&!state?.obs.enabled;
  if(creatingPreset)for(const node of document.querySelectorAll('#mapping-rows input,#mapping-rows select,#mapping-rows button'))node.disabled=true;
  $('#create-display-preset').disabled=saving||streamkitSaving;$('#display-preset-name').disabled=saving||streamkitSaving;$('#display-presets').disabled=saving||streamkitSaving;
  $('#save-display').disabled=!settingsDirty||saving||streamkitSaving;
  $('#demo-count-label').hidden=!demo;$('#demo').disabled=creatingPreset||streamkitSaving;$('#clear-data').disabled=creatingPreset||saving||streamkitSaving;
  $('#discard').hidden=!settingsDirty;$('#discard').disabled=saving||streamkitSaving;$('#discard-streamkit').hidden=!streamkitDirty;$('#discard-streamkit').disabled=saving||streamkitSaving;
  $('#member-save-state').textContent=demo?'デモの対応づけは保存しません':memberSaving?'保存しています':memberSaveError?'保存できません':dirty?'保存待ち':'自動保存済み';$('#member-save-state').classList.toggle('save-error',!!memberSaveError);$('#retry-members').hidden=demo||!memberSaveError||memberConflict;$('#reload-members').hidden=demo||!memberConflict;$('#reload-members').disabled=memberSaving;$('#retry-members').disabled=memberSaving;
  $('#clear-data').disabled=creatingPreset||saving||streamkitSaving||memberSaving;
  $('#save-state').classList.toggle('dirty',pending);$('#save-state').title=pendingDrafts.size?'別のプリセットに未保存の編集があります。元のプリセットに戻ると復元します。':'';
  $('#save-label').textContent=saving||memberSaving?'保存しています':memberSaveError?'対応づけを保存できません':settingsDirty||streamkitDirty?'未保存の変更があります':dirty?'保存待ち':'保存済み';

}
function syncStreamkitForm(){
  const profile=state?.streamkitProfiles.find(p=>p.id===state.activeStreamkit);streamkitBaseActive=state?.activeStreamkit??'';streamkitFormId=profile?.id??'';streamkitFormRevision=profile?.revision??0;streamkitNameDraft=profile?.name??'';streamkitDraft=profile?.url??'';$('#streamkit-name').value=streamkitNameDraft;$('#streamkit-url').value=streamkitDraft;
}
function updateStreamkitState(){
  const saved=state?.preset.streamkitUrl??'',busy=saving||streamkitSaving;let url='',error='';try{url=cleanStreamkitUrl(streamkitDraft);}catch(e){error=e.message;}
  $('#streamkit-state').textContent=error||(streamkitDirty?'未保存の変更があります':saved?'URL保存済み · メンバータブで表示先を切り替えられます':'未設定');$('#streamkit-state').classList.toggle('invalid',!!error);
  $('#streamkit-url').disabled=busy;$('#streamkit-name').disabled=busy;$('#save-streamkit').disabled=!streamkitDirty||busy;$('#new-streamkit').disabled=busy;$('#copy-streamkit').disabled=!saved||streamkitDirty||busy;$('#clear-streamkit').disabled=!streamkitFormId||streamkitDirty||busy;$('#streamkit-target').disabled=busy;
  const obs=state?.obs??{};$('#obs-toggle').textContent=obs.enabled?'OBS連携を停止':'OBS連携を開始';$('#obs-toggle').disabled=busy||(!obs.enabled&&(!saved||streamkitDirty||state?.mode==='demo'||state?.preset.settings.displaySource!=='streamkit'||settingsDirty));
  $('#autoStartObs').checked=state?.preferences?.autoStartObs===true;$('#autoStartObs').disabled=busy;$('#obs-script-copy').disabled=!window.crewLink?.copyObsScriptPath||!obs.enabled;
  $('#obs-status').textContent=obs.error?'連携を確認してください':obs.enabled?'連携ファイル更新中':'停止中';$('#obs-dot').classList.toggle('online',!!obs.enabled);$('#obs-folder').disabled=!window.crewLink?.openObsFolder||!obs.enabled;
  $('#obs-sync-state').textContent=obs.error||(obs.enabled?`連携ファイル更新中 · 登録 ${obs.mapped}件 / ゲーム内 ${obs.present}人（OBS表示はOBS側で確認）`:'停止中');
}
function editStreamkit(){streamkitDraft=$('#streamkit-url').value;streamkitNameDraft=$('#streamkit-name').value;streamkitDirty=true;streamkitEditorRevision++;updateSaveState();}
$('#streamkit-url').oninput=editStreamkit;$('#streamkit-name').oninput=editStreamkit;
$('#edit-streamkit').onclick=()=>{openView('connections');$('#streamkit-name').focus();};
$('#new-streamkit').onclick=()=>{if(streamkitDirty){toast('表示先の変更を保存するか、元に戻してから新しく登録してください。');return;}streamkitBaseActive=state.activeStreamkit;streamkitFormId='';streamkitFormRevision=0;streamkitDraft='';streamkitNameDraft='';$('#streamkit-url').value='';$('#streamkit-name').value='';streamkitDirty=true;streamkitEditorRevision++;updateSaveState();$('#streamkit-name').focus();};
$('#save-streamkit').onclick=async()=>{
 if(saving||streamkitSaving||!streamkitDirty)return;const revision=streamkitEditorRevision,body={id:streamkitFormId,name:streamkitNameDraft,url:streamkitDraft,expectedRevision:streamkitFormRevision,expectedActiveId:streamkitBaseActive};streamkitSaving=true;updateSaveState();
 try{const result=await post('/api/streamkit/save',body);if(revision===streamkitEditorRevision)streamkitDirty=false;receive(result);toast(result.streamkitSavedId===state.activeStreamkit?'表示先を保存しました。':'表示先を保存しました。現在の選択は維持しています。');}catch(e){toast(e.message);}finally{streamkitSaving=false;if(!streamkitDirty)syncStreamkitForm();updateSaveState();}
};
$('#streamkit-target').onchange=async event=>{
 if(saving||streamkitSaving||streamkitDirty){event.target.value=state.activeStreamkit;toast('表示先の変更を保存するか、元に戻してから切り替えてください。');return;}streamkitSaving=true;updateSaveState();
 try{receive(await post('/api/streamkit/select',{id:event.target.value}));}catch(e){toast(e.message);event.target.value=state.activeStreamkit;}finally{streamkitSaving=false;if(!streamkitDirty)syncStreamkitForm();updateSaveState();}
};
$('#clear-streamkit').onclick=async()=>{
 if(saving||streamkitSaving||streamkitDirty||!streamkitFormId)return;if(!window.confirm('「'+streamkitNameDraft+'」の登録を削除します。選択中の場合はOBS連携を停止します。対応づけ一覧は残ります。'))return;const body={id:streamkitFormId,revision:streamkitFormRevision};streamkitSaving=true;updateSaveState();
 try{receive(await post('/api/streamkit/delete',body));toast('表示先の登録を削除しました。');}catch(e){toast(e.message);}finally{streamkitSaving=false;syncStreamkitForm();updateSaveState();}
};
$('#copy-streamkit').onclick=async()=>{
 try{const url=cleanStreamkitUrl(state?.preset.streamkitUrl);if(!url||streamkitDirty)throw Error('先にURLを保存してください。');if(window.crewLink?.copyStreamkitUrl)await window.crewLink.copyStreamkitUrl();else await navigator.clipboard.writeText(url);toast('保存済みのStreamkit URLをコピーしました。');}
 catch{toast('URLを保存してからコピーしてください。コピーできない場合はURL欄を選択してコピーしてください。');$('#streamkit-url').focus();$('#streamkit-url').select();}
};
$('#obs-toggle').onclick=async()=>{try{receive(await post('/api/obs/export',{enabled:!state.obs?.enabled}));}catch(e){toast(e.message);}};
$('#obs-folder').onclick=async()=>{try{await window.crewLink.openObsFolder();}catch(e){toast(e.message);}};
$('#obs-script-copy').onclick=async()=>{try{await window.crewLink.copyObsScriptPath();toast('スクリプトの場所をコピーしました。');}catch(e){toast(e.message);}};
$('#autoStartObs').onchange=async()=>{try{receive(await post('/api/preferences',{autoStartObs:$('#autoStartObs').checked}));toast('自動開始の設定を保存しました。');}catch(e){toast(e.message);receive(state);}};
function scheduleMemberSave(){if(!memberSaveTimer&&dirty&&state?.mode==='live'&&!memberSaveError&&!memberComposing)memberSaveTimer=setTimeout(saveMemberChanges,350);}
function edited(composing=false){dirty=true;memberRevision++;memberSaveError='';memberConflict=false;memberComposing=composing;lastKey='';clearTimeout(memberSaveTimer);memberSaveTimer=null;if(!composing)scheduleMemberSave();updateSaveState();renderPreview();}
async function saveMemberChanges(){
 clearTimeout(memberSaveTimer);memberSaveTimer=null;if(!dirty||memberSaving||creatingPreset||state?.mode!=='live')return;const target=memberKey(state),revision=memberRevision,body={presetId:state.preset.id,links:structuredClone(draft),baseLinks:structuredClone(memberBase)};memberSaving=true;memberSaveError='';updateSaveState();
 try{const result=await post('/api/save',body);if(target===memberKey(state)){memberBase=structuredClone(body.links);if(revision===memberRevision)dirty=false;}if(pendingDrafts.get(target)?.revision===revision)pendingDrafts.delete(target);receive(result);}catch(e){if(target===memberKey(state)&&revision===memberRevision){memberSaveError=e.message;memberConflict=e.code==='MEMBER_CONFLICT';toast('対応づけを保存できません。編集内容を保持しています。'+e.message);}}finally{memberSaving=false;updateSaveState();if(dirty&&!memberSaveError)scheduleMemberSave();}
}
$('#retry-members').onclick=()=>{memberSaveError='';saveMemberChanges();};
$('#reload-members').onclick=async()=>{
 if(!window.confirm('この画面の対応づけの未保存編集を破棄し、最新の保存設定を使います。よろしいですか？'))return;
 const target=memberKey(state),revision=memberRevision;
 try{const response=await fetch('/api/state');if(!response.ok)throw Error('最新の設定を取得できません。');const latest=await response.json();if(target!==memberKey(state)||revision!==memberRevision)return;
  clearTimeout(memberSaveTimer);memberSaveTimer=null;dirty=false;memberSaveError='';memberConflict=false;memberComposing=false;memberRevision++;pendingDrafts.delete(target);lastKey='';receive(latest.instanceId===state.instanceId&&latest.stateVersion<state.stateVersion?state:latest);toast('最新の対応づけを読み込みました。');
 }catch(e){toast(e.message);}
};
function memberIssue(link,player){if(!player||state.mode==='demo')return '';return !link?'未登録':!/^[0-9]{15,22}$/.test(link.discordId)?'ID不正':'';}
function memberDisplayed(link){return !!link&&(state.mode==='demo'||/^[0-9]{15,22}$/.test(link.discordId))&&state.game.displayPlayers.some(p=>p.key===link.gameKey);}
function updateMemberVisibility(){for(const node of document.querySelectorAll('.member-visibility')){const link=draft.find(l=>l.gameKey===node.dataset.gameKey),shown=memberDisplayed(link),current=state.game.players.some(p=>p.key===link?.gameKey);node.textContent=shown?(current?'表示':'保持中'):'非表示';node.classList.toggle('is-visible',shown);}}
function setMemberFilter(value){memberFilter=value;$('#member-filter').value=value;table();}
$('#member-filter').onchange=event=>setMemberFilter(event.target.value);
$('#mapping-coverage').onclick=()=>{if($('#mapping-coverage').disabled)return;openView('mapping');setMemberFilter('needs');$('#member-filter').focus();};
function moveMember(source,target){const from=draft.findIndex(l=>l.gameKey===source),to=draft.findIndex(l=>l.gameKey===target);if(from<0||to<0||from===to)return;const [item]=draft.splice(from,1);draft.splice(to,0,item);edited();table();toast('配信順を変更しました。');}
function endMemberDrag(){memberDragKey='';document.querySelectorAll('#mapping-rows .drop-before,#mapping-rows .drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));}
function gameRows(){return [...draft.map(link=>({link,player:state.game.players.find(p=>p.key===link.gameKey)})),...state.game.players.filter(p=>!draft.some(link=>link.gameKey===p.key)).map(player=>({player,link:null}))].sort((a,b)=>Number(!!b.player)-Number(!!a.player));}
function table(){
  const allRows=gameRows(),demo=state.mode==='demo',streamkit=true,rows=demo||memberFilter==='all'?allRows:allRows.filter(({link,player})=>memberFilter==='hidden'?!memberDisplayed(link):!!memberIssue(link,player));$('#mapping-empty').hidden=rows.length>0;
  const filtered=memberFilter!=='all'&&!demo;$('#mapping-empty strong').textContent=filtered?'該当するメンバーはいません':'ゲームのロビーに参加してください';$('#mapping-empty p').hidden=filtered;$('#mapping-empty button').hidden=filtered;
  $('#mapping-rows').replaceChildren(...rows.map(({link,player})=>{
    const tr=document.createElement('tr'),td=document.createElement('td'),key=player?.key||link.gameKey;
    tr.dataset.gameKey=key;tr.dataset.gamePresent=String(!!player);const displayName=player?.name||link?.gameName||'保存済みメンバー';
    const chip=document.createElement('span');chip.className='game-chip';if(player)appendCharacter(chip,player);
    const name=document.createElement('span');name.className='player-name';name.textContent=displayName;name.draggable=!!link&&!demo&&!creatingPreset;name.title=name.draggable?'ドラッグで配信順を変更':'';
    name.ondragstart=event=>{if(!name.draggable)return;memberDragKey=key;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',key);};name.ondragend=()=>{endMemberDrag();table();};
    tr.ondragover=event=>{if(!memberDragKey||!link||demo||memberDragKey===key)return;event.preventDefault();event.dataTransfer.dropEffect='move';document.querySelectorAll('#mapping-rows .drop-before,#mapping-rows .drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'));tr.classList.add(draft.findIndex(l=>l.gameKey===memberDragKey)<draft.findIndex(l=>l.gameKey===key)?'drop-after':'drop-before');};
    tr.ondrop=event=>{if(!memberDragKey||!link||demo)return;event.preventDefault();const source=memberDragKey;endMemberDrag();moveMember(source,key);};td.append(chip,name);
    const detail=document.createElement('small');detail.className='player-detail';detail.hidden=!!player;detail.textContent=!player?'ゲームに不在':streamkit?(link?'ID登録済み':'ユーザーIDを入力'):!link?'Discord参加者を選択':state.discord.members.some(m=>m.id===link.discordId)?'対応づけ済み':'通話に不在';const issue=memberIssue(link,player);if(issue){detail.hidden=false;detail.textContent=issue;detail.className='member-issue';}td.append(detail);tr.append(td);
    const select=document.createElement(streamkit?'input':'select');select.setAttribute('aria-label',displayName+'のDiscord参加者');
    if(streamkit){select.type='text';select.inputMode='numeric';select.maxLength=22;select.placeholder='DiscordユーザーID';select.pattern='[0-9]{15,22}';}
    else{
    const none=document.createElement('option');none.value='';none.textContent=link?'対応づけを解除':'参加者を選択';select.append(none);
    const members=[...state.discord.members];if(link&&!members.some(m=>m.id===link.discordId))members.push({id:link.discordId,name:(link.label||link.gameName||'保存済み参加者')+'（通話に不在）'});
    for(const member of members){const option=document.createElement('option');option.value=member.id;option.textContent=member.name;select.append(option);}}select.value=link?.discordId||'';select.disabled=demo;
    const memberCell=document.createElement('td'),memberField=document.createElement('div');memberField.className='member-field';memberField.append(select);memberCell.append(memberField);tr.append(memberCell);
    function unlink(){draft=draft.filter(l=>l.gameKey!==key);edited();table();toast('対応づけを解除しました。自動保存します。');}
    if(link){const remove=document.createElement('button');remove.type='button';remove.className='unlink-button';remove.textContent='解除';remove.setAttribute('aria-label',displayName+'の対応づけを解除');remove.disabled=demo;remove.onclick=unlink;memberField.append(remove);}
    const label=document.createElement('input');label.value=link?.label||'';label.placeholder='Discord名を使用';label.maxLength=80;label.disabled=demo||!select.value;label.setAttribute('aria-label',displayName+'の配信用の名前');const labelCell=document.createElement('td');labelCell.append(label);tr.append(labelCell);
    const visible=document.createElement('span');visible.className='member-visibility';visible.dataset.gameKey=key;visible.setAttribute('aria-label',displayName+'の表示状態');const visibleCell=document.createElement('td');visibleCell.append(visible);tr.append(visibleCell);
    function ensure(){let item=draft.find(l=>l.gameKey===key);if(!item){item={gameKey:key,gameName:player?.name||'',discordId:select.value,label:label.value,visible:true};draft.push(item);}if(player)item.gameName=player.name;return item;}
    select.onchange=()=>{
      const previous=draft.find(l=>l.gameKey===key);
      select.value=select.value.trim();
      if(streamkit&&select.value&&!/^[0-9]{15,22}$/.test(select.value)){toast('ユーザーIDは15〜22桁の数字で入力してください。');select.value=previous?.discordId||'';return;}
      if(select.value&&draft.some(l=>l.gameKey!==key&&l.discordId===select.value)){toast('そのDiscord参加者は別のプレイヤーに設定されています。');select.value=previous?.discordId||'';return;}
      if(!select.value){unlink();return;}ensure().discordId=select.value;
      label.disabled=demo||!select.value;detail.textContent=select.value?'対応づけ済み':'Discord参加者を選択';edited();table();
    };
    label.oninput=event=>{if(select.value){ensure().label=label.value;edited(event.isComposing);}};label.addEventListener('compositionend',()=>{memberComposing=false;scheduleMemberSave();});label.addEventListener('blur',()=>{memberComposing=false;scheduleMemberSave();});
    const controls=document.createElement('td');if(link){const order=document.createElement('span');order.className='order-number';order.textContent=String(draft.findIndex(l=>l.gameKey===key)+1);controls.append(order);}
    for(const [text,offset]of [['↑',-1],['↓',1]]){const button=document.createElement('button');button.textContent=text;button.className='order-button';button.setAttribute('aria-label',displayName+(offset<0?'を前へ':'を後ろへ'));const index=draft.findIndex(l=>l.gameKey===key);button.disabled=demo||index<0||index+offset<0||index+offset>=draft.length;button.onclick=()=>{[draft[index],draft[index+offset]]=[draft[index+offset],draft[index]];edited();table();};controls.append(button);}tr.append(controls);return tr;
  }));updateMemberVisibility();
}
function receive(next){
  if(state?.instanceId===next.instanceId&&Number.isFinite(next.stateVersion)&&next.stateVersion<state.stateVersion)return;
  const changed=state?.preset.id!==next.preset.id,modeChanged=state?.mode!==next.mode,displayChanged=state?.displayPreset.id!==next.displayPreset.id;
  if(state&&(changed||modeChanged)&&dirty)pendingDrafts.set(memberKey(state),{draft:structuredClone(draft),baseLinks:structuredClone(memberBase),revision:memberRevision});
  if(state&&displayChanged&&settingsDirty)pendingDrafts.set(displayKey(state),{settings:settings(),revision:displayRevision});
  state=next;
  for(const key of pendingDrafts.keys())if(key!=='members:live:'+next.preset.id&&key!=='members:demo:'+next.preset.id&&!next.displayPresets.some(p=>key==='display:'+p.id))pendingDrafts.delete(key);
  let restored=false;
  if(changed||modeChanged){clearTimeout(memberSaveTimer);memberSaveTimer=null;memberSaveError='';memberConflict=false;memberComposing=false;endMemberDrag();dirty=false;memberRevision++;lastKey='';if(pendingDrafts.has(memberKey(next))){const saved=pendingDrafts.get(memberKey(next));pendingDrafts.delete(memberKey(next));draft=saved.draft;memberBase=structuredClone(saved.baseLinks??next.preset.links);dirty=true;memberRevision++;restored=true;}}
  if(displayChanged){settingsDirty=false;if(pendingDrafts.has(displayKey(next))){const saved=pendingDrafts.get(displayKey(next));pendingDrafts.delete(displayKey(next));syncSettings(saved.settings);settingsDirty=true;displayRevision++;restored=true;}}
  if(restored)toast('このプリセットの未保存の編集を復元しました。');
  if(!dirty){memberBase=structuredClone(next.preset.links);draft=structuredClone(next.mode==='demo'?next.game.players.map((player,i)=>({gameKey:player.key,discordId:'demo-user-'+i,label:'',visible:true})):next.preset.links);}
  if(!streamkitDirty&&!streamkitSaving)syncStreamkitForm();
  const target=$('#streamkit-target'),choices=[{id:'',name:'選択なし'},...next.streamkitProfiles];if(JSON.stringify([...target.options].map(o=>[o.value,o.textContent]))!==JSON.stringify(choices.map(p=>[p.id,p.name])))target.replaceChildren(...choices.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));target.value=next.activeStreamkit;
  if(!settingsDirty)syncSettings();
  const demo=next.mode==='demo';
  $('#game-status').textContent=demo?'デモ表示中':next.reader?.status==='unsupported'?'未対応バージョン':next.reader?.status==='error'?'読取を確認してください':next.game.online?'接続中':'起動・参加を待っています';
  $('#game-dot').classList.toggle('online',next.game.online);$('#game-count').textContent=next.game.players.length+'人';
  $('#game-status').title=demo?'表示確認用の架空メンバー':next.reader?.message||'Among Usの起動を待っています';
  $('#notice').hidden=true;$('#notice').textContent='';$('#demo').textContent=demo?'実際の接続に戻る':'デモを試す';
  for(const key of settingKeys)$('#'+key).disabled=false;
  $('.life-help').textContent=!demo&&next.game.online&&!next.game.lifeTracking?'会議情報を確認できないため、死亡マークの自動更新を保留しています。':'死亡は会議開始時、追放は会議終了後の確定時に更新します。NebulaのMADMATE巻き添えと、SNRの道連れ・後追いは次の会議開始時に反映します。途中起動時は次の会議から同期します。';
  $('#overlay-url').value=next.overlayUrl;
  const gameOnly=next.preset.settings.displaySource==='game';
  const participants=next.game.online||demo?next.game.players:[],registered=new Set(next.preset.links.filter(l=>/^[0-9]{15,22}$/.test(l.discordId)).map(l=>l.gameKey));
  const covered=gameOnly||demo?participants.length:participants.filter(p=>registered.has(p.key)).length,missing=participants.length-covered;
  $('#member-count').textContent=covered;$('#count-label').textContent='表示対象';
  const coverage=$('#mapping-coverage');coverage.textContent=demo?'デモ':!participants.length?'':gameOnly?'自動表示':missing?`未設定${missing}人`:'全員対応済み';coverage.classList.toggle('incomplete',!gameOnly&&!demo&&missing>0);coverage.disabled=gameOnly||demo||missing===0;
  const presetSignature=options=>options.map(option=>[option.value,option.textContent]);
  if(JSON.stringify(presetSignature([...$('#display-presets').options]))!==JSON.stringify(next.displayPresets.map(p=>[p.id,p.name])))$('#display-presets').replaceChildren(...next.displayPresets.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;return option;}));$('#display-presets').value=next.displayPreset.id;
  $('#unresolved').hidden=true;
  const key=JSON.stringify([next.mode,next.game.players,next.game.displayPlayers.map(p=>p.key),next.discord.members.map(m=>({id:m.id,name:m.name})),next.preset.id,next.preset.streamkitUrl,draft]);
  if(key!==lastKey&&!memberDragKey&&!document.querySelector('#mapping-rows :focus')){table();lastKey=key;}
  updateMemberVisibility();renderPreview();updateSaveState();if(dirty&&!memberSaving&&!memberSaveError)scheduleMemberSave();
}
async function toggleDemo(){if(dirty||memberSaving||settingsDirty||streamkitDirty||streamkitSaving||saving){toast('変更を保存するか、元に戻してから切り替えてください。');return;}try{receive(await post('/api/demo',{enabled:state.mode!=='demo'}));}catch(error){toast(error.message);}}
async function copyUrl(){try{if(window.crewLink?.copyOverlayUrl)await window.crewLink.copyOverlayUrl();else await navigator.clipboard.writeText(state.overlayUrl);toast('OBS用URLをコピーしました。');}catch{toast('URL欄を選択してコピーしてください。');$('#overlay-url').focus();$('#overlay-url').select();}}
$('#demo-count').onchange=renderPreview;$('#demo').onclick=toggleDemo;$('#copy-url').onclick=copyUrl;$('#copy-game-url').onclick=copyUrl;

async function saveChanges(){
  if(saving||streamkitSaving||!settingsDirty)return;const target=displayKey(state),revision=displayRevision;saving=true;updateSaveState();
  try{const result=await post('/api/save',{displayPresetId:state.displayPreset.id,settings:settings()});if(target===displayKey(state)&&revision===displayRevision)settingsDirty=false;if(pendingDrafts.get(target)?.revision===revision)pendingDrafts.delete(target);receive(result);toast('見た目を保存しました。');}catch(e){toast(e.message);}finally{saving=false;updateSaveState();}
}
$('#save-display').onclick=saveChanges;
$('#discard').onclick=()=>{settingsDirty=false;displayRevision++;pendingDrafts.delete(displayKey(state));lastKey='';receive(state);toast('見た目の変更を元に戻しました。');};
$('#discard-streamkit').onclick=()=>{streamkitDirty=false;streamkitEditorRevision++;syncStreamkitForm();updateSaveState();toast('表示先の変更を元に戻しました。');};
async function selectPreset(event){
  if(saving||streamkitSaving||settingsDirty){event.target.value=state.displayPreset.id;toast('見た目の変更を保存するか、元に戻してください。');return;}
  try{lastKey='';receive(await post('/api/display-presets/select',{id:event.target.value}));}catch(error){event.target.value=state.displayPreset.id;toast(error.message);}
}
$('#display-presets').onchange=selectPreset;
async function createPreset(){
  if(saving||streamkitSaving)return;const input=$('#display-preset-name'),name=input.value.trim();if(!name){toast('プリセット名を入力してください。');return;}
  const target=displayKey(state),body={name,displayPresetId:state.displayPreset.id,settings:settings()};saving=true;creatingPreset=true;updateSaveState();
  try{const result=await post('/api/display-presets/create',body);pendingDrafts.delete(target);settingsDirty=false;lastKey='';receive(result);input.value='';$('#display-preset-create').open=false;toast('新しい見た目プリセットを保存しました。');}
  catch(error){toast(error.message);}finally{creatingPreset=false;saving=false;table();updateSaveState();scheduleMemberSave();}
}
$('#create-display-preset').onclick=createPreset;
for(const key of settingKeys)$('#'+key).oninput=()=>{settingsDirty=true;displayRevision++;updateOutputs();renderPreview();updateSaveState();};
$('#clear-data').onclick=async()=>{
 if(!window.confirm('このPCの対応づけ・表示先の登録・見た目プリセットをすべて削除します。よろしいですか？'))return;
 clearTimeout(memberSaveTimer);memberSaveTimer=null;
 try{const result=await post('/api/data/clear',{});pendingDrafts.clear();dirty=false;memberSaveError='';memberConflict=false;memberComposing=false;memberRevision++;settingsDirty=false;streamkitDirty=false;streamkitEditorRevision++;lastKey='';receive(result);toast('保存データを削除しました。');}catch(error){toast(error.message);}finally{scheduleMemberSave();}
};
setupSettingsTransfer({canChange:()=>{if(!state||settingsTransferBusy)return false;if(dirty||memberSaving||settingsDirty||streamkitDirty||streamkitSaving||saving||creatingPreset||pendingDrafts.size){toast('未保存の変更を保存するか、元に戻してから操作してください。');return false;}return true;},setBusy:value=>{settingsTransferBusy=value;$('.shell').inert=value;},post,receive,toast,beforeImport:()=>{clearTimeout(memberSaveTimer);memberSaveTimer=null;pendingDrafts.clear();dirty=false;memberSaveError='';memberConflict=false;memberComposing=false;memberRevision++;settingsDirty=false;streamkitDirty=false;streamkitEditorRevision++;lastKey='';}});
setupPresetManager({getState:()=>state,canChange:()=>{if(!state){toast('アプリを読み込み中です。');return false;}if(dirty||memberSaving){toast('対応づけの自動保存が完了してから操作してください。');return false;}if(settingsDirty||streamkitDirty||streamkitSaving||saving||creatingPreset||pendingDrafts.size){toast('未保存の変更を保存するか、元に戻してから操作してください。');return false;}return true;},post,receive,toast});
window.addEventListener('beforeunload',event=>{if(settingsTransferBusy||dirty||memberSaving||settingsDirty||streamkitDirty||streamkitSaving||pendingDrafts.size){event.preventDefault();event.returnValue='';}});
try{const bootstrap=await(await fetch('/api/bootstrap')).json();token=bootstrap.token;receive(bootstrap);const stream=new EventSource('/api/events');stream.onmessage=event=>receive(JSON.parse(event.data));stream.onerror=()=>{$('#notice').hidden=false;$('#notice').textContent='アプリとの接続が切れました。起動状態を確認してください。';};}catch{toast('アプリに接続できません。起動し直してください。');}
