import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getGames: () => Promise<any[]>
      getImagePath: (imageId: string) => Promise<string | null>
      launchGame: (gameId: string) => Promise<void>
    }
  }
}
