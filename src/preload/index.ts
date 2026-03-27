import { contextBridge, ipcRenderer, webFrame, webUtils } from 'electron'

const resolveOsType = (): string => {
  switch (process.platform) {
    case 'darwin':
      return 'Darwin'
    case 'win32':
      return 'Windows_NT'
    case 'linux':
      return 'Linux'
    default:
      return 'unknown'
  }
}

// System information available to renderer
const systemInfo = {
  platform: process.platform,
  arch: process.arch,
  osType: resolveOsType()
}

const electronBridge = {
  ipcRenderer: {
    send(channel: string, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args)
    },
    invoke(channel: string, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args)
    },
    on(channel: string, listener: (...args: unknown[]) => void) {
      ipcRenderer.on(channel, listener as Parameters<typeof ipcRenderer.on>[1])
      return () => {
        ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.on>[1])
      }
    },
    once(channel: string, listener: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, listener as Parameters<typeof ipcRenderer.once>[1])
      return () => {
        ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.once>[1])
      }
    },
    removeListener(channel: string, listener: (...args: unknown[]) => void) {
      ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.on>[1])
      return this
    },
    removeAllListeners(channel: string) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
  webFrame: {
    insertCSS(css: string) {
      return webFrame.insertCSS(css)
    },
    setZoomFactor(factor: number) {
      if (typeof factor === 'number' && factor > 0) {
        webFrame.setZoomFactor(factor)
      }
    },
    setZoomLevel(level: number) {
      if (typeof level === 'number') {
        webFrame.setZoomLevel(level)
      }
    }
  },
  webUtils: {
    getPathForFile(file: File) {
      return webUtils.getPathForFile(file)
    }
  },
  process: {
    get platform() {
      return process.platform
    },
    get versions() {
      return process.versions
    },
    get env() {
      return { ...process.env }
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronBridge)
    contextBridge.exposeInMainWorld('systemInfo', () => systemInfo)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronBridge
  // @ts-ignore (define in dts)
  window.systemInfo = () => systemInfo
}
