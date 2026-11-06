const {contextBridge,ipcRenderer}=require('electron');

// Expose only the fixed OBS URL copy action, never arbitrary clipboard access.
contextBridge.exposeInMainWorld('crewLink',Object.freeze({
  copyOverlayUrl:()=>ipcRenderer.invoke('crew-link:copy-overlay-url')
}));
