export interface Game {
  id: string;
  coverUrl: string;
  title: string;
  description?: string;
  platform: string;
  path?: string;
}

export interface Credentials {
  success: boolean;
  user?: string;
  error?: string;
  
}
