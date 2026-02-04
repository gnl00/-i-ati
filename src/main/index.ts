import { electronApp, optimizer } from '@electron-toolkit/utils'
import { mcpClient } from '@main/mcp/client'
import { BrowserWindow, app, globalShortcut, ipcMain } from 'electron'
import { destroyWindowPool, getWindowPool } from './tools/webTools/BrowserWindowPool'
import { cleanupDevServers } from './tools/devServer/DevServerProcessor'
import { initializeMainEmbeddedTools } from './tools'
import { mainIPCSetup as ipcSetup } from './main-ipc'
import { createWindow } from './main-window'
import DatabaseService from './services/DatabaseService'
import MemoryService from './services/memory/MemoryService'
import { SkillService } from './services/skills/SkillService'
import { schedulerService } from './services/scheduler/SchedulerService'
import { StartupTracer } from './utils/startupTracer'
import { STARTUP_RENDERER_MARK, STARTUP_RENDERER_READY } from '@shared/constants/startup'

// const reactDevToolsPath = path.join(
//   os.homedir(),
//   'Library/Application Support/Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/6.0.1_0'
// )

const startupTracer = new StartupTracer()
startupTracer.mark('boot.start')
let rendererReadyMarked = false
let rendererSummaryScheduled = false
ipcMain.on(STARTUP_RENDERER_READY, () => {
  if (rendererReadyMarked) return
  rendererReadyMarked = true
  startupTracer.mark('renderer.ready')
  if (!rendererSummaryScheduled) {
    rendererSummaryScheduled = true
    setTimeout(() => {
      startupTracer.reportWithLabel('after-renderer-ready')
    }, 200)
  }
})
ipcMain.on(STARTUP_RENDERER_MARK, (_event, label: string, offsetMs?: number) => {
  const safeLabel = typeof label === 'string' ? label : 'renderer.mark'
  if (typeof offsetMs === 'number' && Number.isFinite(offsetMs)) {
    console.log(`[Startup] renderer.${safeLabel} +${offsetMs.toFixed(1)}ms`)
    return
  }
  startupTracer.mark(`renderer.${safeLabel}`)
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  startupTracer.mark('app.ready')
  // await session.defaultSession.loadExtension(reactDevToolsPath)

  // Initialize database service
  console.log('[App] Initializing database service...')
  startupTracer.mark('db.init.start')
  await DatabaseService.initialize()
  startupTracer.mark('db.init.end')
  const appConfig = DatabaseService.initConfig()

  // Initialize memory service
  console.log('[App] Initializing memory service...')
  startupTracer.mark('memory.init.start')
  await MemoryService.initialize()
  startupTracer.mark('memory.init.end')

  // Initialize skills from configured folders (background)
  void SkillService.initializeFromConfig(appConfig)

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

  // setup mainIPC
  startupTracer.mark('ipc.init.start')
  initializeMainEmbeddedTools()
  ipcSetup()
  startupTracer.mark('ipc.init.end')

  schedulerService.start()

  // IPC handlers 必须在窗口创建前注册
  // 渲染进程（renderer）可能在窗口创建后立即尝试调用 IPC 方法。如果 handlers 还没注册，这些调用就会失败。
  console.log('[App] Initializing main window...')
  startupTracer.mark('window.create.start')
  createWindow((window) => {
    window.webContents.once('did-finish-load', () => {
      startupTracer.mark('window.did-finish-load')
    })
  })
  startupTracer.mark('window.create.end')


  // Initialize window pool for web search (in background)
  console.log('[App#TASK] Initializing window pool...')
  getWindowPool().initialize().then(() => {
    console.log('[App#TASK] Window pool initialized')
  }).catch(err => {
    console.error('[App#TASK] Failed to initialize window pool:', err)
  })

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
  if (mcpClient) {
    mcpClient.removeAllServers()
  }
  // Clean up window pool
  destroyWindowPool()
  // Clean up development servers
  cleanupDevServers()
  schedulerService.stop()
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.