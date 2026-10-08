import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('kindle', {
  state: () => ipcRenderer.invoke('mdk:state'),
  choose: () => ipcRenderer.invoke('mdk:choose'),
  prepare: () => ipcRenderer.invoke('mdk:prepare'),
  send: (recipient: string) => ipcRenderer.invoke('mdk:send', recipient),
  save: (settings: unknown, password: string) => ipcRenderer.invoke('mdk:save', settings, password),
  test: () => ipcRenderer.invoke('mdk:test'),
});
