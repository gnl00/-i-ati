import { app, BrowserWindow, globalShortcut } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import path from 'node:path'
import os from 'node:os'
import { loadConfig } from './app-config'
import { createWindow } from './main-window'
import { mainIPCSetup as ipcSetup } from './main-ipc'
import { closeAll as mcpClientClose } from '../mcp/client'

const reactDevToolsPath = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/6.0.1_0'
)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // await session.defaultSession.loadExtension(reactDevToolsPath)
  
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')
  // globalShortcut.unregister("Esc")
  // globalShortcut.register('CtrlOrCmd+Esc', () => {
  //   mainWindow.hide()
  // })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // load app config
  loadConfig()

  // setup mainIPC
  ipcSetup()

  // IPC handlers 必须在窗口创建前注册
  // 渲染进程（renderer）可能在窗口创建后立即尝试调用 IPC 方法。如果 handlers 还没注册，这些调用就会失败。
  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
  globalShortcut.unregisterAll()
  mcpClientClose()
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.