import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('kindle', {
  state: () => ipcRenderer.invoke('mdk:state'),
  chooseFiles: () => ipcRenderer.invoke('mdk:chooseFiles'),
  chooseFolder: (recursive: boolean) => ipcRenderer.invoke('mdk:chooseFolder', recursive),
  selection: (ids: string[]) => ipcRenderer.invoke('mdk:selection', ids),
  prepare: () => ipcRenderer.invoke('mdk:prepare'),
  preview: (id: string) => ipcRenderer.invoke('mdk:preview', id),
  send: (recipient: string) => ipcRenderer.invoke('mdk:send', recipient),
  save: (settings: unknown, password: string) => ipcRenderer.invoke('mdk:save', settings, password),
  test: () => ipcRenderer.invoke('mdk:test'),
  onProgress: (callback: (progress: unknown) => void) => { ipcRenderer.on('mdk:progress', (_event, progress) => callback(progress)); },
});
