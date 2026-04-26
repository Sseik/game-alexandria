import { ElectronAPI } from '@electron-toolkit/preload';
import {
  AdminAccessData,
  AdminAuditEntry,
  AdminRbacSummary,
  Credentials,
  Game,
  IgdbImportCandidate,
  ImportedGameResult,
  LibraryPlatform,
  ProfileDashboard,
  RecentSessionGame,
  User
} from 'src/shared/types';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      getGames: () => Promise<Game[]>;
      getGameDetails: (gameId: string) => Promise<Game | null>;
      searchIgdbGames: (query: string) => Promise<IgdbImportCandidate[]>;
      importIgdbGame: (userId: number, igdbId: number) => Promise<ImportedGameResult>;
      login: ({ email: string, password: string }) => Promise<Credentials>;
      getUser: (userId: number) => Promise<User | null>;
      setActiveRemoteUser: (userId: number) => Promise<{ success: boolean }>;
      clearActiveRemoteUser: () => Promise<{ success: boolean }>;
      getLibrary: (userId: number) => Promise<Game[]>;
      getWishlist: (userId: number) => Promise<Game[]>;
      addToWishlist: (
        userId: number,
        gameId: string,
        targetPrice?: number
      ) => Promise<{ success: boolean }>;
      isInWishlist: (userId: number, gameId: string) => Promise<{ exists: boolean }>;
      removeFromWishlist: (userId: number, gameId: string) => Promise<{ success: boolean }>;
      getLibraryPlatforms: () => Promise<LibraryPlatform[]>;
      addGameToLibrary: (
        userId: number,
        gameId: string,
        platformName: string,
        executablePath?: string
      ) => Promise<{ success: boolean; error?: string }>;
      updateLibraryGameEntry: (
        userId: number,
        gameId: string,
        currentPlatformId: string,
        platformName: string,
        executablePath?: string
      ) => Promise<{ success: boolean; error?: string }>;
      launchLibraryGame: (
        userId: number,
        gameId: string,
        platformId?: string
      ) => Promise<{ success: boolean; error?: string }>;
      getRecentSessionGames: (userId: number, limit?: number) => Promise<RecentSessionGame[]>;
      getProfileDashboard: (userId: number) => Promise<ProfileDashboard>;
      getAdminRbacSummary: () => Promise<AdminRbacSummary>;
      getAdminAccessData: () => Promise<AdminAccessData>;
      updateAdminUserRole: (
        targetUserId: number,
        roleId: number
      ) => Promise<{ success: boolean; error?: string }>;
      createAdminRole: (name: string) => Promise<{ success: boolean; error?: string }>;
      deleteAdminRole: (roleId: number) => Promise<{ success: boolean; error?: string }>;
      createAdminPermission: (
        action: string,
        description?: string
      ) => Promise<{ success: boolean; error?: string }>;
      deleteAdminPermission: (
        permissionId: number
      ) => Promise<{ success: boolean; error?: string }>;
      updateAdminRolePermissions: (
        roleId: number,
        permissionIds: number[]
      ) => Promise<{ success: boolean; error?: string }>;
      getAdminAuditLog: (limit?: number) => Promise<AdminAuditEntry[]>;
      dialogOpenFile: () => Promise<string | null>;
      removeLibraryGameEntry: (
        userId: number,
        gameId: string,
        platformId: string
      ) => Promise<{ success: boolean; error?: string }>;
      showConfirmDialog: (message: string) => Promise<boolean>;
      deleteGame(gameId: string): Promise<{ success: boolean; error?: string }>;
    };
  }
}
