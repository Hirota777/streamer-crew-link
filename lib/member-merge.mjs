// Three-way merge: changes to distinct fields or members may be combined;
// competing changes, removals and reorders must never silently overwrite data.
export function mergeMemberLinks(base,current,incoming,clean){
 const conflict=()=>Object.assign(new Error('別の画面で同じ対応づけが変更されました。編集内容を確認し、必要なら控えてから「最新の設定を使う」を選んでください。'),{code:'MEMBER_CONFLICT'});
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),fields=['gameName','discordId','label','visible'];
 const entry=row=>row&&Object.fromEntries(fields.map(k=>[k,row[k]]));
 const maps=[base,current,incoming].map(rows=>new Map(rows.map(r=>[r.gameKey,r]))),[old,latest,edited]=maps,result=new Map();
 for(const key of new Set([...old.keys(),...latest.keys(),...edited.keys()])){
  const a=old.get(key),b=latest.get(key),c=edited.get(key);let row;
  if(!a){if(b&&c&&!same(entry(b),entry(c)))throw conflict();row=c??b;}
  else if(!b||!c){if(b&&!same(entry(b),entry(a))||c&&!same(entry(c),entry(a)))throw conflict();row=null;}
  else{row={gameKey:key};for(const field of fields){if(same(c[field],a[field]))row[field]=b[field];else if(same(b[field],a[field])||same(b[field],c[field]))row[field]=c[field];else throw conflict();}}
  if(row)result.set(key,row);
 }
 const keys=rows=>rows.map(r=>r.gameKey).filter(k=>result.has(k)),common=new Set(base.map(r=>r.gameKey).filter(k=>result.has(k)&&latest.has(k)&&edited.has(k))),relative=rows=>keys(rows).filter(k=>common.has(k));
 const original=relative(base),other=relative(current),local=relative(incoming),otherMoved=!same(original,other),localMoved=!same(original,local);
 if(otherMoved&&localMoved&&!same(other,local))throw conflict();
 const order=[...new Set([...(localMoved?keys(incoming):keys(current)),...keys(incoming),...keys(current)])];
 try{return clean(order.map(key=>({...result.get(key),gameKey:key})));}catch{throw conflict();}
}
