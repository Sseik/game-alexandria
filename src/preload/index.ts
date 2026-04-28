import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import { Credentials } from '../shared/types';

// Custom APIs for renderer
const api = {
  getGames: () => ipcRenderer.invoke('get-games'),
  getGameDetails: (gameId: string) => ipcRenderer.invoke('get-game-details', gameId),
  searchIgdbGames: (query: string) => ipcRenderer.invoke('igdb:search-games', query),
  importIgdbGame: (userId: number, igdbId: number) =>
    ipcRenderer.invoke('igdb:import-game', userId, igdbId),
  login: (credentials: Credentials) => ipcRenderer.invoke('auth:login', credentials),
  getUser: (userId: number) => ipcRenderer.invoke('auth:get-user', userId),
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
  getAdminRbacSummary: () => ipcRenderer.invoke('admin:get-rbac-summary'),
  getAdminAccessData: () => ipcRenderer.invoke('admin:get-access-data'),
  updateAdminUserRole: (targetUserId: number, roleId: number) =>
    ipcRenderer.invoke('admin:update-user-role', targetUserId, roleId),
  createAdminRole: (name: string) => ipcRenderer.invoke('admin:create-role', name),
  deleteAdminRole: (roleId: number) => ipcRenderer.invoke('admin:delete-role', roleId),
  createAdminPermission: (action: string, description?: string) =>
    ipcRenderer.invoke('admin:create-permission', action, description),
  deleteAdminPermission: (permissionId: number) =>
    ipcRenderer.invoke('admin:delete-permission', permissionId),
  updateAdminRolePermissions: (roleId: number, permissionIds: number[]) =>
    ipcRenderer.invoke('admin:update-role-permissions', roleId, permissionIds),
  getAdminAuditLog: (limit?: number) => ipcRenderer.invoke('admin:get-audit-log', limit),
  dialogOpenFile: () => ipcRenderer.invoke('dialog:open-file'),
  removeLibraryGameEntry: (userId: number, gameId: string, platformId: string) =>
    ipcRenderer.invoke('library:remove-entry', userId, gameId, platformId),
  showConfirmDialog: (message: string) => ipcRenderer.invoke('dialog:confirm', message),
  deleteGame: (gameId: string) => ipcRenderer.invoke('admin:delete-game', gameId),
  register: (data: { email: string; username: string }) =>
    ipcRenderer.invoke('auth:register', data),
  resetPassword: (email) => ipcRenderer.invoke('auth:reset-password', email)
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
