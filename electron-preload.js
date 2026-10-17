import { contextBridge, ipcRenderer } from 'electron';

// Expose secure APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  isElectron: true,
});
