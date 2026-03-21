import { ElectronAPI } from '@electron-toolkit/preload'
import { Credentials } from 'src/shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getGames: () => Promise<Game[]>,
      login: ({email: string, password: string}) => Promise<Credentials>
    }
  }
}
