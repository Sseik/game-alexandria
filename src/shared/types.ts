export interface Game {
  id: string;
  libraryEntryId?: string;
  coverUrl: string;
  logoUrl?: string;
  screenshots?: string[];
  videos?: string[];
  title: string;
  description?: string;
  score?: number | null;
  platformId: string;
  platformName?: string;
  path?: string;
  executablePath?: string | null;
  igdbId?: number | null;
  platforms?: string[];
  platformLinks?: PlatformLink[];
  priceHistory?: Array<{
    label: string;
    price: number;
  }>;
  priceStats?: {
    current: number;
    lowest: number;
    highest: number;
  };
  targetPrice?: number | null;
  addedAt?: string;
  cheapsharkUrl?: string; // <--- ДОДАТИ ЦЕЙ РЯДОК
}

export interface PlatformLink {
  platform: string;
  url: string;
  launchUrl?: string;
  category?: number;
}

export interface LibraryPlatform {
  id: number;
  name: string;
  launchPrefix?: string | null;
}

export interface RecentSessionGame {
  gameId: string;
  title: string;
  image: string;
  platformId?: string;
  platformName?: string;
  canLaunch: boolean;
  lastPlayedAt: string;
}

export interface ProfileSession {
  id: number;
  gameTitle: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes: number;
}

export interface ProfileDashboard {
  sessions: number;
  totalMinutes: number;
  averageMinutes: number;
  recentActivity: Array<{ label: string; minutes: number }>;
  durationBuckets: Array<{ label: string; count: number }>;
  byGame: Array<{
    gameTitle: string;
    sessions: number;
    totalMinutes: number;
    averageMinutes: number;
  }>;
  sessionHistory: ProfileSession[];
}

export interface AdminRoleSummary {
  id: number;
  name: string;
  usersCount: number;
  permissions: string[];
}

export interface AdminPermissionSummary {
  id: number;
  action: string;
  description?: string;
  usedInRoles: string[];
}

export interface AdminRbacSummary {
  rolesCount: number;
  permissionsCount: number;
  roles: AdminRoleSummary[];
  permissions: AdminPermissionSummary[];
}

export interface AdminUserSummary {
  id: number;
  username: string;
  email: string;
  roleId: number;
  roleName: string;
  createdAt?: string;
}

export interface AdminRoleOption {
  id: number;
  name: string;
}

export interface AdminEditableRole extends AdminRoleOption {
  permissionIds: number[];
  usersCount: number;
}

export interface AdminEditablePermission {
  id: number;
  action: string;
  description?: string;
}

export interface AdminAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: 'user' | 'role' | 'permission' | 'rbac' | 'game';
  targetId?: string;
  details?: string;
  createdAt: string;
}

export interface IgdbImportCandidate {
  igdbId: number;
  title: string;
  description?: string;
  coverUrl?: string;
  score?: number | null;
  inDatabase: boolean;
  gameId?: string;
}

export interface ImportedGameResult {
  success: boolean;
  created: boolean;
  game?: Game;
  error?: string;
}

export interface AdminAccessData {
  users: AdminUserSummary[];
  roles: AdminEditableRole[];
  permissions: AdminEditablePermission[];
}

export interface Credentials {
  success: boolean;
  user?: User;
  error?: string;
}

export interface Role {
  id: number;
  name: string;
  canRemoteLaunch?: boolean;
  permissions?: string[];
}

export interface User {
  id: number;
  username: string;
  email: string;
  roleId: number;
  createdAt?: string;
  role?: Role;
}
