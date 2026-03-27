export interface SystemInfo {
  platform: NodeJS.Platform
  arch: string
  osType: string
}

export interface ElectronBridge {
  ipcRenderer: {
    on(channel: string, listener: (...args: any[]) => void): () => void
    once(channel: string, listener: (...args: any[]) => void): () => void
    removeAllListeners(channel: string): void
    removeListener(channel: string, listener: (...args: any[]) => void): ElectronBridge['ipcRenderer']
    send(channel: string, ...args: any[]): void
    invoke(channel: string, ...args: any[]): Promise<any>
  }
  webFrame: {
    insertCSS(css: string): string
    setZoomFactor(factor: number): void
    setZoomLevel(level: number): void
  }
  webUtils: {
    getPathForFile(file: File): string
  }
  process: {
    readonly platform: string
    readonly versions: Record<string, string | undefined>
    readonly env: Record<string, string | undefined>
  }
}

declare global {
  interface Window {
    electron: ElectronBridge
    systemInfo: () => SystemInfo
  }
}
