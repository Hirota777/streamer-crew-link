import {appendCharacter,statusBadgeSvg} from './icons.js';
export function renderCrew(target,state){
  const s=state.preset.settings;target.style.setProperty('--crew-size',s.size+'px');target.style.setProperty('--crew-gap',s.gap+'px');target.style.setProperty('--name-size',(s.nameSize??12)+'px');
  target.style.setProperty('--character-scale',String((s.characterScale??100)/100));target.style.setProperty('--badge-ratio',String((s.badgeSize??42)/100));target.classList.toggle('vertical',s.orientation==='vertical');
  const rows=state.rows.filter(r=>r.visible&&r.player&&r.member);
  const renderKey=JSON.stringify([s,rows.map(r=>({gameKey:r.gameKey,label:r.label,player:r.player,member:{id:r.member.id,name:r.member.name,avatar:r.member.avatar}}))]);
  if(target.crewRenderKey===renderKey&&target.children.length===rows.length){
    rows.forEach((r,index)=>target.children[index].classList.toggle('speaking',Boolean(r.member.speaking)));return rows.length;
  }
  target.crewRenderKey=renderKey;
  target.replaceChildren(...rows.map(r=>{
    const item=document.createElement('div');item.className='crew-item'+(r.member.speaking?' speaking':'')+(s.dimIdle?' dim-idle':'');item.style.setProperty('--player-color',r.player.color);
    const character=document.createElement('div');character.className='character';appendCharacter(character,r.player);item.append(character);
    const avatarWrap=document.createElement('div');avatarWrap.className='avatar-wrap';
    const avatar=document.createElement('div');avatar.className='avatar';
    if(r.member.avatar&&/^https:\/\/cdn\.discordapp\.com\//.test(r.member.avatar)){const img=document.createElement('img');img.src=r.member.avatar;img.alt='';img.onerror=()=>{img.remove();avatar.textContent=r.member.name.slice(0,2);};avatar.append(img);}else{avatar.textContent=r.member.name.slice(0,2);}
    avatarWrap.append(avatar);
    const badge=s.showStatus!==false?statusBadgeSvg(r.player.lifeState):null;
    if(badge){const mark=document.createElement('span');mark.className='state-badge';mark.setAttribute('role','img');mark.setAttribute('aria-label',r.player.lifeState==='exiled'?'投票で追放':'死亡');mark.innerHTML=badge;avatarWrap.append(mark);}
    item.append(avatarWrap);if(s.showNames){const name=document.createElement('div');name.className='crew-name';name.textContent=r.label||r.member.name;name.title=name.textContent;(s.orientation==='vertical'?avatarWrap:item).append(name);}return item;
  }));return rows.length;
}
if(document.body.classList.contains('overlay')){
  if(new URL(location.href).searchParams.get('preview')==='1')document.body.classList.add('overlay-preview');
  const stream=new EventSource('/api/events');stream.onmessage=e=>{const state=JSON.parse(e.data);renderCrew(document.querySelector('#overlay-crew'),state);document.querySelector('#overlay-demo').hidden=state.mode!=='demo';};
  stream.onerror=()=>document.querySelector('#overlay-crew').replaceChildren();
}
