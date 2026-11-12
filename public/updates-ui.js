export function setupUpdateUI({canInstall}){
 if(!window.crewLink?.update)return;
 window.crewLinkCanInstallUpdate=canInstall;
 const panel=document.createElement('section');panel.className='update-panel';panel.hidden=true;panel.setAttribute('aria-label','アプリの更新');
 panel.innerHTML='<div class="update-heading"><strong id="update-title"></strong><span id="update-version"></span></div><p id="update-message" role="status" aria-live="polite"></p><progress id="update-progress" hidden max="100"></progress><details id="update-notes-wrap"><summary>変更内容</summary><pre id="update-notes"></pre></details><div class="update-actions"><button id="update-download" class="primary small">更新する</button><button id="update-install" class="primary small">終了して更新</button><button id="update-release" class="secondary small">配布ページを開く</button><button id="update-later" class="secondary small">あとで</button><button id="update-skip" class="secondary small">このバージョンをスキップ</button><button id="update-cancel" class="secondary small">ダウンロードを中止</button></div>';
 document.querySelector('.app-header').after(panel);
 const box=document.createElement('details');box.className='panel storage-settings update-settings';box.innerHTML='<summary>アプリの更新</summary><label class="check"><input id="update-auto" type="checkbox" checked> 起動時に更新を確認する</label><button id="update-check" class="secondary small">更新を確認</button><p class="footnote">新しい正式リリースがある場合にお知らせします。更新のインストール前にアプリを終了するため、OBS表示は一時停止します。</p>';
 document.querySelector('#connections').prepend(box);
 const $=id=>document.getElementById(id);let revision=-1,actionBusy=false;
 function receive(state){
  if(!state||state.revision<revision)return;revision=state.revision;
  const {phase,release,message,installed}=state,available=!!release,download=phase==='downloading',ready=phase==='ready';
  panel.hidden=!available&&!message&&!state.lastResult;panel.dataset.phase=phase;
  $('update-title').textContent=available?'新しいバージョンがあります':'アプリの更新';
  $('update-version').textContent=available?`${state.current} → ${release.version}`:'';
  $('update-message').textContent=[state.lastResult,message,available&&!installed?'ZIP版・開発版では、配布ページからMSI版をインストールしてください。':''].filter(Boolean).join(' ');
  $('update-auto').checked=state.autoCheck;$('update-auto').disabled=state.storageAvailable===false;$('update-check').disabled=phase==='checking'||download;
  $('update-progress').hidden=!download;$('update-progress').value=available&&release.size&&Number.isFinite(state.received)?Math.max(0,Math.min(100,state.received/release.size*100)):0;
  $('update-notes-wrap').hidden=!available;$('update-notes').textContent=release?.notes||'変更内容は配布ページをご確認ください。';
  $('update-download').hidden=!available||!installed||download||ready;
  $('update-install').hidden=!ready;$('update-release').hidden=!available;
  $('update-later').hidden=download;$('update-later').textContent=available?'あとで':'閉じる';$('update-skip').hidden=!available||download||ready;$('update-cancel').hidden=!download;
 }
 async function act(action,value){
  const parallel=['cancel','preference','release'].includes(action);if(actionBusy&&!parallel)return;
  if(action==='install'&&!canInstall()){$('update-message').textContent='未保存の編集があります。編集したプリセットを保存するか、変更を元に戻してから更新してください。';return;}
  if(!parallel)actionBusy=true;
  try{receive(await window.crewLink.update(action,value));}catch{panel.hidden=false;$('update-message').textContent='更新操作に失敗しました。時間をおいてお試しください。';}
  finally{if(!parallel)actionBusy=false;}
 }
 for(const [id,action]of [['update-check','check'],['update-download','download'],['update-install','install'],['update-release','release'],['update-later','later'],['update-skip','skip'],['update-cancel','cancel']])$(id).onclick=()=>act(action);
 $('update-auto').onchange=event=>act('preference',event.target.checked);
 window.crewLink.onUpdate(receive);act('status');
}
