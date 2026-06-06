const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('liveControlDesktop', {
  getContext: () => ipcRenderer.invoke('desktop:get-context'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('desktop:open-path', targetPath),
  startTikTokLogin: (options = {}) => ipcRenderer.invoke('desktop:start-tiktok-login', options),
})
