import {appendCharacter} from './icons.js';
export function renderCrew(target,state){
  const s=state.preset.settings;target.style.setProperty('--crew-size',s.size+'px');target.style.setProperty('--crew-gap',s.gap+'px');
  const rows=state.rows.filter(r=>r.visible&&r.player&&r.member);
  target.replaceChildren(...rows.map(r=>{
    const item=document.createElement('div');item.className='crew-item'+(r.member.speaking?' speaking':'')+(s.dimIdle?' dim-idle':'');item.style.setProperty('--player-color',r.player.color);
    const character=document.createElement('div');character.className='character';appendCharacter(character,r.player);item.append(character);
    const avatar=document.createElement('div');avatar.className='avatar';
    if(r.member.avatar&&/^https:\/\/cdn\.discordapp\.com\//.test(r.member.avatar)){const img=document.createElement('img');img.src=r.member.avatar;img.alt='';img.onerror=()=>{img.remove();avatar.textContent=r.member.name.slice(0,2);};avatar.append(img);}else{avatar.textContent=r.member.name.slice(0,2);}
    item.append(avatar);if(s.showNames){const name=document.createElement('div');name.className='crew-name';name.textContent=r.label||r.member.name;item.append(name);}return item;
  }));return rows.length;
}
if(document.body.classList.contains('overlay')){
  const stream=new EventSource('/api/events');stream.onmessage=e=>{const state=JSON.parse(e.data);renderCrew(document.querySelector('#overlay-crew'),state);document.querySelector('#overlay-demo').hidden=state.mode!=='demo';};
  stream.onerror=()=>document.querySelector('#overlay-crew').replaceChildren();
}
