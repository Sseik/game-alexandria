import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { Credentials } from '../shared/types';

// Custom APIs for renderer
const api = {
  getGames: () => ipcRenderer.invoke('get-games'),
  login: (credentials: Credentials) => ipcRenderer.invoke('auth:login', credentials),
  getLibrary: (userId: number) => ipcRenderer.invoke('get-library', userId)
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
