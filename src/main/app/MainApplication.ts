import { electronApp, optimizer } from '@electron-toolkit/utils'
import { mcpRuntimeService } from '@main/services/mcpRuntime'
import { BrowserWindow, app, globalShortcut, ipcMain } from 'electron'
import { destroyWindowPool, getWindowPool } from '@main/tools/webTools/BrowserWindowPool'
import { cleanupDevServers } from '@main/tools/devServer/DevServerProcessor'
import { initializeMainEmbeddedTools } from '@main/tools'
import { mainIPCSetup } from '@main/main-ipc'
import {
  createWindow,
  getMainWindow,
  setMainWindowAppQuitting
} from '@main/main-window'
import { databaseRuntime } from '@main/db/runtime'
import { configDb } from '@main/db/config'
import MemoryService from '@main/services/memory/MemoryService'
import { SkillService } from '@main/services/skills/SkillService'
import { schedulerService } from '@main/services/scheduler/SchedulerService'
import { smartMessageSchedulerService } from '@main/services/smartMessages'
import { telegramGatewayService } from '@main/services/telegram'
import { modelsDevCacheService } from '@main/services/models/ModelsDevCacheService'
import { emotionAssetService } from '@main/services/emotion/EmotionAssetService'
import { knowledgebaseService } from '@main/services/knowledgebase/KnowledgebaseService'
import { installMainConsoleCapture } from '@main/logging/console-capture'
import { createPerfLogger, logService } from '@main/logging/LogService'
import { StartupTracer } from '@main/utils/startupTracer'
import { STARTUP_RENDERER_MARK, STARTUP_RENDERER_READY } from '@shared/constants/startup'
import appIcon from '../../../build/icon.png?asset'

export class MainApplication {
  private readonly startupTracer = new StartupTracer()
  private readonly startupLogger = createPerfLogger('Startup')
  private rendererReadyMarked = false
  private rendererSummaryScheduled = false
  private cleanupDone = false
  private lifecycleRegistered = false

  registerLifecycle(): void {
    if (this.lifecycleRegistered) return
    this.lifecycleRegistered = true
    this.startupTracer.mark('boot.start')
    this.registerStartupTracing()

    void app.whenReady()
      .then(() => this.start())
      .catch((error) => {
        console.error('[App] Failed during app.whenReady bootstrap:', error)
      })

    app.on('before-quit', () => {
      setMainWindowAppQuitting(true)
      this.stop()
    })

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit()
      }
    })
  }

  private async start(): Promise<void> {
    await logService.initialize()
    installMainConsoleCapture()
    this.startupTracer.mark('app.ready')
    if (process.platform === 'darwin' && app.dock) {
      app.dock.setIcon(appIcon)
    }

    console.log('[App] Initializing database service...')
    this.startupTracer.mark('db.init.start')
    await databaseRuntime.initialize()
    this.startupTracer.mark('db.init.end')
    const appConfig = configDb.initConfig()

    console.log('[App] Initializing memory service...')
    this.startupTracer.mark('memory.init.start')
    try {
      await MemoryService.initialize()
    } catch (error) {
      console.error('[App] Failed to initialize memory service; continuing without vector memory features:', error)
    }
    this.startupTracer.mark('memory.init.end')

    console.log('[App] Initializing knowledgebase service...')
    this.startupTracer.mark('knowledgebase.init.start')
    try {
      await knowledgebaseService.initialize()
    } catch (error) {
      console.error('[App] Failed to initialize knowledgebase service; continuing without knowledgebase features:', error)
    }
    this.startupTracer.mark('knowledgebase.init.end')

    void SkillService.initializeFromConfig(appConfig)
    electronApp.setAppUserModelId('com.electron')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    this.startupTracer.mark('ipc.init.start')
    initializeMainEmbeddedTools()
    mainIPCSetup()
    await emotionAssetService.registerProtocol()
    this.startupTracer.mark('ipc.init.end')

    schedulerService.start()
    smartMessageSchedulerService.start()
    void modelsDevCacheService.ensureFreshSnapshot().catch((error) => {
      console.error('[App#TASK] Failed to initialize models.dev cache:', error)
    })

    console.log('[App] Initializing main window...')
    this.startupTracer.mark('window.create.start')
    createWindow((window) => {
      window.webContents.once('did-finish-load', () => {
        this.startupTracer.mark('window.did-finish-load')
      })
    })
    this.startupTracer.mark('window.create.end')

    console.log('[App#TASK] Initializing window pool...')
    void getWindowPool().initialize()
      .then(() => console.log('[App#TASK] Window pool initialized'))
      .catch((error) => console.error('[App#TASK] Failed to initialize window pool:', error))

    void telegramGatewayService.start().catch((error) => {
      console.error('[App#TASK] Failed to start telegram gateway:', error)
    })

    app.on('activate', () => this.activateMainWindow())
  }

  private stop(): void {
    if (this.cleanupDone) return
    this.cleanupDone = true
    globalShortcut.unregisterAll()
    mcpRuntimeService.disconnectAll()
    destroyWindowPool()
    cleanupDevServers()
    schedulerService.stop()
    smartMessageSchedulerService.stop()
    telegramGatewayService.stop()
  }

  private activateMainWindow(): void {
    const existingWindow = getMainWindow()
    if (existingWindow) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore()
      }
      return
    }

    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  }

  private registerStartupTracing(): void {
    ipcMain.on(STARTUP_RENDERER_READY, () => {
      if (this.rendererReadyMarked) return
      this.rendererReadyMarked = true
      this.startupTracer.mark('renderer.ready')
      if (this.rendererSummaryScheduled) return
      this.rendererSummaryScheduled = true
      setTimeout(() => this.startupTracer.reportWithLabel('after-renderer-ready'), 200)
    })

    ipcMain.on(STARTUP_RENDERER_MARK, (_event, label: string, offsetMs?: number) => {
      const safeLabel = typeof label === 'string' ? label : 'renderer.mark'
      if (typeof offsetMs === 'number' && Number.isFinite(offsetMs)) {
        this.startupLogger.info('renderer.mark', {
          label: `renderer.${safeLabel}`,
          offsetMs: Number(offsetMs.toFixed(1))
        })
        return
      }
      this.startupTracer.mark(`renderer.${safeLabel}`)
    })
  }
}
