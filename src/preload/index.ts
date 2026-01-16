import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import * as os from 'os'

// System information available to renderer
const systemInfo = {
  platform: process.platform,
  arch: process.arch,
  osType: os.type()
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('systemInfo', () => systemInfo)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.systemInfo = () => systemInfo
  // @ts-ignore (define in dts)
  window.api = api
}
