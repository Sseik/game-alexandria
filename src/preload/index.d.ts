import { ElectronAPI } from '@electron-toolkit/preload';
import {
  AdminRbacSummary,
  Credentials,
  Game,
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
    };
  }
}
