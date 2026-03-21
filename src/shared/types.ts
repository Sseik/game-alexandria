export interface Game {
  id: string;
  coverUrl: string;
  title: string;
  description?: string;
  platform: string;
  path?: string;
}

export interface Credentials {
  password: string;
  email: string;
}
