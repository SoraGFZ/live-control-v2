const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('liveControlDesktop', {
  getContext: () => ipcRenderer.invoke('desktop:get-context'),
  startTikTokLogin: (options = {}) => ipcRenderer.invoke('desktop:start-tiktok-login', options),
})
