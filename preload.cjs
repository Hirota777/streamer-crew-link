const {contextBridge,ipcRenderer}=require('electron');

// Fixed clipboard/update actions only; never expose file paths, arbitrary URLs or process execution.
contextBridge.exposeInMainWorld('crewLink',Object.freeze({
  copyOverlayUrl:()=>ipcRenderer.invoke('crew-link:copy-overlay-url'),
  update:(action,value)=>ipcRenderer.invoke('crew-link:update',action,value),
  onUpdate:callback=>{if(typeof callback!=='function')return;const listener=(_event,state)=>callback(state);ipcRenderer.on('crew-link:update-state',listener);return ()=>ipcRenderer.removeListener('crew-link:update-state',listener);}
}));
