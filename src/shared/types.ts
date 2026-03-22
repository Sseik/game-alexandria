export interface Game {
  id: string;
  coverUrl: string;
  title: string;
  description?: string;
  platformId: string;
  path?: string;
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
}

export interface User {
  id: number;
  username: string;
  email: string;
  roleId: number;
  createdAt?: string; 
  role?: Role; 
}
