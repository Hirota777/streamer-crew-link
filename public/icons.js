const colours=['red','blue','green','pink','orange','yellow','black','white','purple','brown','cyan','lime','maroon','rose','banana','gray','tan','coral'];
const standardShadows=['#7A0838','#09158E','#0A4D2E','#AC2BAE','#B43E15','#C38822','#1E1F26','#8495C0','#3B177C','#5E2615','#24A9BF','#15A842','#410F1A','#DE92B3','#D2BC89','#465664','#51413E','#B44362'];
const hex=value=>/^#[\da-f]{6}$/i.test(value??'');
const isDead=p=>p?.lifeState==='dead'||p?.lifeState==='exiled';
const rgb=colour=>colour.slice(1).match(/../g).map(c=>parseInt(c,16));
const tone=(colour,ratio)=>'#'+rgb(colour).map((c,i)=>Math.round(c*(Array.isArray(ratio)?ratio[i]:ratio)).toString(16).padStart(2,'0')).join('');
export function colorIcon(player){
 if(!player||player.colorSource==='nebula'||player.colorKnown===false||!Number.isInteger(player.colorId)||!colours[player.colorId])return null;
 return `/icons/au${colours[player.colorId]}${isDead(player)?'dead':''}.png`;
}
export function templateIcon(player){return `/icons/aucyan${isDead(player)?'dead':''}.png`;}
export function spritePalette(player){
 if(!hex(player?.color))return null;
 const body=player.color,shadow=hex(player.shadowColor)?player.shadowColor:player.colorSource!=='nebula'&&Number.isInteger(player.colorId)&&standardShadows[player.colorId]?standardShadows[player.colorId]:tone(body,.58);
 const visor=hex(player.visorColor)?player.visorColor:'#95CADC';
 return {body,shadow,visor,visorShadow:tone(visor,[.53,.62,.73]),deep:tone(shadow,.4)};
}
const templates=new Map(),tinted=new Map();
function loadTemplate(dead){
 if(templates.has(dead))return templates.get(dead);
 const result=new Promise((resolve,reject)=>{
  const image=new Image();image.onload=()=>{
   try{
    const scale=Math.min(1,384/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
    canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
    const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0,canvas.width,canvas.height);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height),roles=new Uint8Array(canvas.width*canvas.height);
    // Only coloured regions are recoloured. Outlines, bone, highlights and alpha remain intact.
    const seeds=dead?[[68,253,245,0,45],[36,167,189,1,45],[14,67,58,4,24]]:[[57,254,219,0,45],[36,169,190,1,45],[150,202,221,2,35],[79,125,162,3,35]];
    for(let pixel=0;pixel<roles.length;pixel++){
     const index=pixel*4;if(!pixels.data[index+3])continue;let nearest=Infinity,role=0;
     for(let j=0;j<seeds.length;j++){const seed=seeds[j],distance=(pixels.data[index]-seed[0])**2+(pixels.data[index+1]-seed[1])**2+(pixels.data[index+2]-seed[2])**2;if(distance<seed[4]**2&&distance<nearest){nearest=distance;role=j+1;}}
     roles[pixel]=role;
    }
    resolve({pixels,roles,seeds});
   }catch(error){reject(error);}
  };image.onerror=()=>reject(Error('画像を読み込めません'));image.src=`/icons/aucyan${dead?'dead':''}.png`;
 });
 templates.set(dead,result);result.catch(()=>templates.delete(dead));return result;
}
async function tintedSprite(player){
 const palette=spritePalette(player);if(!palette)throw Error('色を確認できません');
 const dead=isDead(player),key=JSON.stringify([dead,palette]);if(tinted.has(key))return tinted.get(key);
 const template=await loadTemplate(dead);if(tinted.has(key))return tinted.get(key);
 const targets=[palette.body,palette.shadow,palette.visor,palette.visorShadow,palette.deep].map(rgb),data=new Uint8ClampedArray(template.pixels.data);
 for(let pixel=0;pixel<template.roles.length;pixel++){
  const role=template.roles[pixel];if(!role)continue;const seed=template.seeds[role-1],target=targets[seed[3]],index=pixel*4;
  for(let c=0;c<3;c++)data[index+c]=target[c]+template.pixels.data[index+c]-seed[c];
 }
 const canvas=document.createElement('canvas');canvas.width=template.pixels.width;canvas.height=template.pixels.height;canvas.getContext('2d').putImageData(new ImageData(data,canvas.width,canvas.height),0,0);
 if(tinted.size>=64)tinted.delete(tinted.keys().next().value);tinted.set(key,canvas);return canvas;
}
export function appendCharacter(target,player){
 if(player?.colorKnown===false){target.classList.add('color-pending');target.title='色取得待ち';}
 const source=colorIcon(player);
 if(source){const image=document.createElement('img');image.className='character-image';image.alt='';image.src=source;target.append(image);return;}
 const canvas=document.createElement('canvas');canvas.className='character-image';canvas.setAttribute('aria-hidden','true');target.append(canvas);
 tintedSprite(player).then(sprite=>{if(!canvas.isConnected)return;canvas.width=sprite.width;canvas.height=sprite.height;canvas.getContext('2d').drawImage(sprite,0,0);canvas.dataset.ready='true';}).catch(()=>{if(!canvas.isConnected)return;const mark=document.createElement('span');mark.className='unknown-color';mark.textContent='画像取得待ち';canvas.replaceWith(mark);});
}
export function statusBadgeSvg(state){
 if(state==='dead')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="M16 14L48 50M48 14L16 50" stroke="#13202a" stroke-width="26"/><path d="M16 14L48 50M48 14L16 50" stroke="#fffaf4" stroke-width="22"/><path d="M16 14L48 50M48 14L16 50" stroke="#ff244b" stroke-width="14"/></g></svg>`;
 if(state==='exiled')return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -6 72 96" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round"><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#13202a" stroke-width="20"/><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#fffaf4" stroke-width="16"/><path d="M32 7V25M32 29C25 40 13 48 14 60C15 79 49 79 50 60C51 48 39 40 32 29Z" fill="none" stroke="#f4b844" stroke-width="9"/><path d="M28 11L36 6M28 20L36 15M25 42L32 46M18 51L25 56M19 64L26 67M36 69L41 63M40 51L47 47" stroke="#9a631d" stroke-width="2.5"/><rect x="20" y="23" width="24" height="15" rx="6" fill="#f4b844" stroke="#13202a" stroke-width="9"/><rect x="20" y="23" width="24" height="15" rx="6" fill="#f4b844" stroke="#fffaf4" stroke-width="6"/><path d="M23 28L40 25M23 34L40 31" stroke="#9a631d" stroke-width="2.5"/></g></svg>`;
 return null;
}
