export function setupPresetManager({getState,canChange,post,receive,toast}){
 const $=s=>document.querySelector(s);let target=null,importValue=null;
 function open(kind){if(!canChange())return;const state=getState(),preset=state.displayPreset;target={kind,id:preset.id,name:preset.name};$('#manager-title').textContent='見た目プリセットの管理';$('#manager-name').value=preset.name;$('#import-preview').hidden=true;$('#preset-import').value='';importValue=null;$('#preset-delete').disabled=state.displayPresets.length<=1;$('#preset-manager').showModal();}
 async function change(route,body){if(!canChange())return;try{receive(await post(route,body));$('#preset-manager').close();toast('プリセットを更新しました。');}catch(e){toast(e.message);}}
 $('#manage-display').onclick=()=>open('display');$('#manager-close').onclick=()=>$('#preset-manager').close();
 $('#preset-rename').onclick=()=>change('/api/presets/rename',{...target,name:$('#manager-name').value});
 $('#preset-duplicate').onclick=()=>{change('/api/display-presets/create',{name:$('#manager-name').value+(getState().displayPreset.name===$('#manager-name').value?'（コピー）':''),displayPresetId:target.id});};
 $('#preset-delete').onclick=()=>{if(window.confirm('「'+target.name+'」を削除します。保存済みの別のプリセットへ切り替わります。'))change('/api/presets/delete',target);};
 $('#preset-export').onclick=async()=>{
  if(!canChange())return;
  try{
   if(window.crewLink?.exportPreset){const saved=await window.crewLink.exportPreset(target);if(saved)toast('プリセットを書き出しました。');return;}
   const response=await fetch('/api/presets/export?kind='+target.kind+'&id='+encodeURIComponent(target.id));const value=await response.json();if(!response.ok)throw Error(value.error);
   const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Streamer-crew-link-'+target.kind+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('プリセットを書き出しました。');
  }catch(e){toast(e.message);}
 };
 $('#preset-import').onchange=async event=>{
  importValue=null;$('#import-preview').hidden=true;if(!canChange())return;
  try{const file=event.target.files[0];if(!file)return;if(file.size>120*1024)throw Error('読み込みファイルが大きすぎます。');const value=JSON.parse(await file.text());const preview=await post('/api/presets/import-preview',{value});if(preview.kind!==target.kind)throw Error('選択した種類のプリセットではありません。対応する「管理」から読み込んでください。');importValue=value;$('#import-summary').textContent='「'+preview.name+'」'+'／見た目設定'+'を、新しいプリセットとして追加します。既存の内容は上書きしません。';$('#import-preview').hidden=false;}catch(e){toast(e.message);}
 };
 $('#preset-import-confirm').onclick=()=>{if(importValue)change('/api/presets/import',{value:importValue});};
}
