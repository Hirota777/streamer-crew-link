import {appendCharacter,statusBadgeSvg} from './icons.js';
export function renderCrew(target,state){
  const s=state.preset.settings;target.style.setProperty('--crew-size',s.size+'px');target.style.setProperty('--crew-gap',s.gap+'px');target.style.setProperty('--name-size',(s.nameSize??12)+'px');
  target.style.setProperty('--character-scale',String((s.characterScale??100)/100));target.style.setProperty('--badge-ratio',String((s.badgeSize??42)/100));target.classList.toggle('vertical',s.orientation==='vertical');
  const namePosition=s.orientation==='vertical'?(s.verticalNamePosition??'overlap'):(s.horizontalNamePosition??'below');
  target.dataset.namePosition=namePosition;target.classList.toggle('color-background',s.colorBackground===true);target.classList.toggle('bounce-speaking',s.bounceSpeaking===true);target.classList.toggle('hide-character',s.showCharacter===false);
  const rows=state.rows.filter(r=>r.visible&&r.player&&r.member);
  const existing=new Map([...target.children].map(item=>[item.crewKey,item]));
  const ordered=rows.map(r=>{
    const key=JSON.stringify([r.gameKey,r.member.id]);let item=existing.get(key);existing.delete(key);
    if(!item){item=document.createElement('div');item.className='crew-item';item.crewKey=key;
      const character=document.createElement('div');character.className='character';item.append(character);
      const wrap=document.createElement('div');wrap.className='avatar-wrap';const avatar=document.createElement('div');avatar.className='avatar';wrap.append(avatar);item.append(wrap);
    }
    item.classList.toggle('speaking',Boolean(r.member.speaking));item.classList.toggle('dim-idle',Boolean(s.dimIdle));item.style.setProperty('--player-color',r.player.color);item.classList.toggle('has-player-color',r.player.colorKnown!==false&&/^#[\da-f]{6}$/i.test(r.player.color));
    const character=item.querySelector('.character'),wrap=item.querySelector('.avatar-wrap'),avatar=wrap.querySelector('.avatar');
    const characterKey=JSON.stringify([r.player.colorSource,r.player.color,r.player.colorId,r.player.shadowColor,r.player.visorColor,r.player.lifeState,r.player.colorKnown]);
    if(item.characterKey!==characterKey){character.replaceChildren();character.classList.remove('color-pending');character.removeAttribute('title');appendCharacter(character,r.player);item.characterKey=characterKey;}
    const avatarKey=JSON.stringify([r.member.avatar,r.member.name]);
    if(item.avatarKey!==avatarKey){avatar.replaceChildren();if(r.member.avatar&&/^https:\/\/cdn\.discordapp\.com\//.test(r.member.avatar)){const img=document.createElement('img');img.src=r.member.avatar;img.alt='';img.onerror=()=>{if(img.parentElement!==avatar)return;img.remove();avatar.textContent=r.member.name.slice(0,2);};avatar.append(img);}else avatar.textContent=r.member.name.slice(0,2);item.avatarKey=avatarKey;}
    const badge=s.showStatus!==false?statusBadgeSvg(r.player.lifeState):null;
    if(item.badgeKey!==badge){wrap.querySelector('.state-badge')?.remove();if(badge){const mark=document.createElement('span');mark.className='state-badge';mark.setAttribute('role','img');mark.setAttribute('aria-label','死亡');mark.innerHTML=badge;wrap.append(mark);}item.badgeKey=badge;}
    let name=item.querySelector('.crew-name');
    if(s.showNames){if(!name){name=document.createElement('div');name.className='crew-name';}const label=r.label||r.member.name;if(name.textContent!==label)name.textContent=label;name.title=label;const parent=namePosition==='overlap'?wrap:item;if(name.parentElement!==parent)parent.append(name);}else name?.remove();
    return item;
  });
  for(const item of existing.values())item.remove();
  ordered.forEach((item,index)=>{if(target.children[index]!==item)target.insertBefore(item,target.children[index]??null);});
  return rows.length;
}
if(document.body.classList.contains('overlay')){
  if(new URL(location.href).searchParams.get('preview')==='1')document.body.classList.add('overlay-preview');
  const stream=new EventSource('/api/events');stream.onmessage=e=>{const state=JSON.parse(e.data);renderCrew(document.querySelector('#overlay-crew'),state);document.querySelector('#overlay-demo').hidden=state.mode!=='demo';};
  stream.onerror=()=>document.querySelector('#overlay-crew').replaceChildren();
}
