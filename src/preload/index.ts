import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { Credentials } from '../shared/types';

// Custom APIs for renderer
const api = {
  getGames: () => ipcRenderer.invoke('get-games'),
  getGameDetails: (gameId: string) => ipcRenderer.invoke('get-game-details', gameId),
  login: (credentials: Credentials) => ipcRenderer.invoke('auth:login', credentials),
  setActiveRemoteUser: (userId: number) => ipcRenderer.invoke('auth:set-active-user', userId),
  clearActiveRemoteUser: () => ipcRenderer.invoke('auth:clear-active-user'),
  getLibrary: (userId: number) => ipcRenderer.invoke('get-library', userId),
  getWishlist: (userId: number) => ipcRenderer.invoke('get-wishlist', userId),
  addToWishlist: (userId: number, gameId: string, targetPrice?: number) =>
    ipcRenderer.invoke('wishlist:add', userId, gameId, targetPrice),
  isInWishlist: (userId: number, gameId: string) =>
    ipcRenderer.invoke('wishlist:contains', userId, gameId),
  removeFromWishlist: (userId: number, gameId: string) =>
    ipcRenderer.invoke('wishlist:remove', userId, gameId),
  getLibraryPlatforms: () => ipcRenderer.invoke('library:get-platforms'),
  addGameToLibrary: (
    userId: number,
    gameId: string,
    platformName: string,
    executablePath?: string
  ) => ipcRenderer.invoke('library:add-game', userId, gameId, platformName, executablePath),
  updateLibraryGameEntry: (
    userId: number,
    gameId: string,
    currentPlatformId: string,
    platformName: string,
    executablePath?: string
  ) =>
    ipcRenderer.invoke(
      'library:update-entry',
      userId,
      gameId,
      currentPlatformId,
      platformName,
      executablePath
    ),
  launchLibraryGame: (userId: number, gameId: string, platformId?: string) =>
    ipcRenderer.invoke('library:launch', userId, gameId, platformId),
  getRecentSessionGames: (userId: number, limit?: number) =>
    ipcRenderer.invoke('sessions:recent-games', userId, limit),
  getProfileDashboard: (userId: number) => ipcRenderer.invoke('profile:get-dashboard', userId),
  getAdminRbacSummary: () => ipcRenderer.invoke('admin:get-rbac-summary')
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
