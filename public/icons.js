const hex=value=>/^#[\da-f]{6}$/i.test(value??'');
export function characterSvg(player){
 if(!player||!hex(player.color))return null;
 const body=player.color;
 const shade=hex(player.shadowColor)?player.shadowColor:'#'+body.slice(1).match(/../g).map(c=>Math.round(parseInt(c,16)*.58).toString(16).padStart(2,'0')).join('');
 const visor=hex(player.visorColor)?player.visorColor:'#95CADC';
 const dead=player.lifeState==='dead'||player.lifeState==='exiled';
 const drawing=dead?`<g stroke="#10222a" stroke-width="5" stroke-linejoin="round"><path d="M31 45V31Q32 16 48 15Q62 16 66 32L67 45Q85 40 87 56Q88 72 67 78L35 84Q17 81 18 63Z" fill="${body}"/><path d="M32 46Q24 36 24 58Q24 76 37 78L65 72Q78 69 85 59Q81 76 62 80L35 86Q18 82 18 63Z" fill="${shade}" stroke="none"/><path d="M31 45Q48 40 52 60Q50 79 34 84Q19 81 18 65Q17 51 31 45Z" fill="${shade}"/><path d="M29 52Q39 49 43 59Q47 71 34 77" fill="none" stroke="#254d50" stroke-width="4"/><path d="M29 61L18 64Q8 56 5 65Q2 74 12 75L21 73Q20 84 29 82Q37 79 30 72L35 68Z" fill="#eeeae1" stroke="#282c2e" stroke-width="3"/><path d="M29 25Q39 17 51 22L62 35L56 42Q43 31 29 31Z" fill="#ffffff" opacity=".17" stroke="none"/></g>`:`<g stroke="#10222a" stroke-width="4" stroke-linejoin="round"><rect x="8" y="34" width="23" height="38" rx="9" fill="${shade}"/><path d="M26 73V32Q26 10 48 10Q72 10 72 33V75Q72 83 63 83H55V69H43V83H34Q26 83 26 73Z" fill="${body}"/><path d="M28 47Q33 64 47 64H70V75Q70 81 63 81H57V67H41V81H34Q28 81 28 73Z" fill="${shade}" stroke="none"/><path d="M40 26Q51 19 68 27Q76 31 71 43Q60 50 42 43Q35 40 40 26Z" fill="${visor}"/><path d="M46 27Q57 23 66 29" stroke="#e6f8ff" stroke-width="4" stroke-linecap="round" fill="none"/></g>`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" class="character-image${dead?' character-dead':''}" aria-hidden="true">${drawing}</svg>`;
}
// Compatibility export for callers that used the Nebula-only renderer.
export function nebulaSvg(player){const dynamic=player?.colorSource==='nebula'||(player?.colorSource==='snr'&&player.colorId>=18);return dynamic&&player.colorKnown&&[player.color,player.shadowColor,player.visorColor].every(hex)?characterSvg(player):null;}
export function colorIcon(){return null;}
export function appendCharacter(target,player){
 const svg=characterSvg(player);if(svg){target.innerHTML=svg;if(player.colorKnown===false){target.classList.add('color-pending');target.title='色取得待ち';}}else{const mark=document.createElement('span');mark.className='unknown-color';mark.textContent='色取得待ち';target.append(mark);}
}
export function statusBadgeSvg(state){
 if(state==='dead')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="M16 14L48 50M48 14L16 50" stroke="#13202a" stroke-width="26"/><path d="M16 14L48 50M48 14L16 50" stroke="#fffaf4" stroke-width="22"/><path d="M16 14L48 50M48 14L16 50" stroke="#ff244b" stroke-width="14"/></g></svg>`;
 if(state==='exiled')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 72 96" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round"><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#13202a" stroke-width="20"/><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#fffaf4" stroke-width="16"/><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#f4b844" stroke-width="9"/><path d="M28 11L36 6M28 20L36 15M25 42L32 46M18 51L25 56M19 64L26 67M36 69L41 63M40 51L47 47" stroke="#9a631d" stroke-width="2.5"/><rect x="20" y="23" width="24" height="15" rx="6" fill="#f4b844" stroke="#13202a" stroke-width="9"/><rect x="20" y="23" width="24" height="15" rx="6" fill="#f4b844" stroke="#fffaf4" stroke-width="6"/><path d="M23 28L40 25M23 34L40 31" stroke="#9a631d" stroke-width="2.5"/></g></svg>`;
 return null;
}
