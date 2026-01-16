import { ElectronAPI } from '@electron-toolkit/preload'

export interface SystemInfo {
  platform: NodeJS.Platform
  arch: string
  osType: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    systemInfo: () => SystemInfo
    api: {}
  }
}
