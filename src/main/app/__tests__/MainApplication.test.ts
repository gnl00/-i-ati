import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const lifecycleHandlers = new Map<string, (...args: any[]) => void>()
  const powerHandlers = new Map<string, () => void>()
  const order: string[] = []
  const mark = (name: string) => vi.fn(() => {
    order.push(name)
  })

  return {
    lifecycleHandlers,
    powerHandlers,
    powerMonitorOn: vi.fn((event: string, handler: () => void) => {
      powerHandlers.set(event, handler)
    }),
    powerMonitorRemoveListener: vi.fn((event: string, handler: () => void) => {
      if (powerHandlers.get(event) === handler) powerHandlers.delete(event)
    }),
    order,
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    createWindow: mark('window.create'),
    getMainWindow: vi.fn(() => null),
    setMainWindowAppQuitting: vi.fn(),
    logInitialize: mark('logging.initialize'),
    databaseInitialize: mark('database.initialize'),
    configInitialize: vi.fn(() => {
      order.push('config.initialize')
      return {}
    }),
    memoryInitialize: mark('memory.initialize'),
    knowledgebaseInitialize: mark('knowledgebase.initialize'),
    skillsInitialize: mark('skills.initialize'),
    initializeTools: mark('tools.initialize'),
    setupIpc: mark('ipc.initialize'),
    registerProtocol: mark('protocol.initialize'),
    schedulerStart: mark('scheduler.start'),
    schedulerWake: vi.fn(),
    smartSchedulerStart: mark('smart-scheduler.start'),
    unregisterShortcuts: vi.fn(),
    disconnectMcp: vi.fn(),
    destroyWindowPool: vi.fn(),
    cleanupDevServers: vi.fn(),
    schedulerStop: vi.fn(),
    smartSchedulerStop: vi.fn(),
    telegramStop: vi.fn(),
    telegramStart: vi.fn(() => Promise.resolve()),
    windowPoolInitialize: vi.fn(() => Promise.resolve()),
    restoreWindow: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: {
    whenReady: mocks.whenReady,
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      mocks.lifecycleHandlers.set(event, handler)
    }),
    quit: mocks.quit,
    dock: { setIcon: vi.fn() }
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  globalShortcut: {
    unregisterAll: mocks.unregisterShortcuts
  },
  ipcMain: {
    on: vi.fn()
  },
  powerMonitor: {
    on: mocks.powerMonitorOn,
    removeListener: mocks.powerMonitorRemoveListener
  }
}))

vi.mock('@electron-toolkit/utils', () => ({
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() }
}))

vi.mock('@main/main-window', () => ({
  createWindow: mocks.createWindow,
  getMainWindow: mocks.getMainWindow,
  setMainWindowAppQuitting: mocks.setMainWindowAppQuitting
}))

vi.mock('@main/logging/LogService', () => ({
  logService: { initialize: mocks.logInitialize },
  createPerfLogger: () => ({ info: vi.fn() })
}))

vi.mock('@main/logging/console-capture', () => ({ installMainConsoleCapture: vi.fn() }))
vi.mock('@main/db/runtime', () => ({ databaseRuntime: { initialize: mocks.databaseInitialize } }))
vi.mock('@main/db/config', () => ({ configDb: { initConfig: mocks.configInitialize } }))
vi.mock('@main/services/memory/MemoryService', () => ({ default: { initialize: mocks.memoryInitialize } }))
vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({ knowledgebaseService: { initialize: mocks.knowledgebaseInitialize } }))
vi.mock('@main/services/skills/SkillService', () => ({ SkillService: { initializeFromConfig: mocks.skillsInitialize } }))
vi.mock('@main/tools', () => ({ initializeMainEmbeddedTools: mocks.initializeTools }))
vi.mock('@main/main-ipc', () => ({ mainIPCSetup: mocks.setupIpc }))
vi.mock('@main/services/images/ImageAssetService', () => ({ imageAssetService: { registerProtocol: vi.fn() } }))
vi.mock('@main/services/emotion/EmotionAssetService', () => ({ emotionAssetService: { registerProtocol: mocks.registerProtocol } }))
vi.mock('@main/services/scheduler/SchedulerService', () => ({ schedulerService: { start: mocks.schedulerStart, stop: mocks.schedulerStop, wake: mocks.schedulerWake } }))
vi.mock('@main/services/smartMessages', () => ({ smartMessageSchedulerService: { start: mocks.smartSchedulerStart, stop: mocks.smartSchedulerStop } }))
vi.mock('@main/services/models/ModelsDevCacheService', () => ({ modelsDevCacheService: { ensureFreshSnapshot: vi.fn(() => Promise.resolve()) } }))
vi.mock('@main/services/telegram', () => ({ telegramGatewayService: { start: mocks.telegramStart, stop: mocks.telegramStop } }))
vi.mock('@main/services/mcpRuntime', () => ({ mcpRuntimeService: { disconnectAll: mocks.disconnectMcp } }))
vi.mock('@main/tools/webTools/BrowserWindowPool', () => ({
  getWindowPool: () => ({ initialize: mocks.windowPoolInitialize }),
  destroyWindowPool: mocks.destroyWindowPool
}))
vi.mock('@main/tools/devServer/DevServerProcessor', () => ({ cleanupDevServers: mocks.cleanupDevServers }))
vi.mock('@main/utils/startupTracer', () => ({
  StartupTracer: class {
    mark = vi.fn()
    reportWithLabel = vi.fn()
  }
}))

import { MainApplication } from '../MainApplication'

describe('MainApplication', () => {
  beforeEach(() => {
    mocks.lifecycleHandlers.clear()
    mocks.powerHandlers.clear()
    mocks.order.length = 0
    vi.clearAllMocks()
    mocks.whenReady.mockImplementation(() => Promise.resolve())
    mocks.getMainWindow.mockReturnValue(null)
  })

  it('registers once and preserves startup and idempotent shutdown ordering', async () => {
    const application = new MainApplication()

    application.registerLifecycle()
    application.registerLifecycle()

    await vi.waitFor(() => expect(mocks.createWindow).toHaveBeenCalledOnce())
    expect(mocks.whenReady).toHaveBeenCalledOnce()
    const milestones = mocks.order.filter((entry) => [
      'logging.initialize',
      'database.initialize',
      'config.initialize',
      'memory.initialize',
      'knowledgebase.initialize',
      'skills.initialize',
      'tools.initialize',
      'ipc.initialize',
      'protocol.initialize',
      'scheduler.start',
      'smart-scheduler.start',
      'window.create'
    ].includes(entry))
    expect(milestones).toHaveLength(12)
    expect(milestones).toEqual([
      'logging.initialize',
      'database.initialize',
      'config.initialize',
      'memory.initialize',
      'knowledgebase.initialize',
      'skills.initialize',
      'tools.initialize',
      'ipc.initialize',
      'protocol.initialize',
      'scheduler.start',
      'smart-scheduler.start',
      'window.create'
    ])

    const beforeQuit = mocks.lifecycleHandlers.get('before-quit')
    expect(beforeQuit).toBeTypeOf('function')
    beforeQuit?.()
    beforeQuit?.()

    expect(mocks.setMainWindowAppQuitting).toHaveBeenCalledTimes(2)
    expect(mocks.unregisterShortcuts).toHaveBeenCalledOnce()
    expect(mocks.disconnectMcp).toHaveBeenCalledOnce()
    expect(mocks.destroyWindowPool).toHaveBeenCalledOnce()
    expect(mocks.cleanupDevServers).toHaveBeenCalledOnce()
    expect(mocks.schedulerStop).toHaveBeenCalledOnce()
    expect(mocks.smartSchedulerStop).toHaveBeenCalledOnce()
    expect(mocks.telegramStop).toHaveBeenCalledOnce()
  })

  it('wakes the scheduler on resume after startup and removes the listener on shutdown', async () => {
    const application = new MainApplication()
    application.registerLifecycle()
    application.registerLifecycle()
    expect(mocks.powerMonitorOn).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(mocks.createWindow).toHaveBeenCalledOnce())
    expect(mocks.powerMonitorOn).toHaveBeenCalledOnce()
    const resume = mocks.powerHandlers.get('resume')
    expect(resume).toBeTypeOf('function')
    resume?.()
    expect(mocks.schedulerWake).toHaveBeenCalledOnce()

    mocks.lifecycleHandlers.get('before-quit')?.()
    mocks.lifecycleHandlers.get('before-quit')?.()
    expect(mocks.powerMonitorRemoveListener).toHaveBeenCalledExactlyOnceWith('resume', resume)
    expect(mocks.powerHandlers.has('resume')).toBe(false)
    mocks.powerHandlers.get('resume')?.()
    expect(mocks.schedulerWake).toHaveBeenCalledOnce()
  })

  it('restores an existing window and recreates a missing window on activation', async () => {
    const application = new MainApplication()
    application.registerLifecycle()
    await vi.waitFor(() => expect(mocks.createWindow).toHaveBeenCalledOnce())
    mocks.createWindow.mockClear()

    mocks.getMainWindow.mockReturnValue({
      isMinimized: () => true,
      restore: mocks.restoreWindow
    } as any)
    mocks.lifecycleHandlers.get('activate')?.()
    expect(mocks.restoreWindow).toHaveBeenCalledOnce()
    expect(mocks.createWindow).not.toHaveBeenCalled()

    mocks.getMainWindow.mockReturnValue(null)
    mocks.lifecycleHandlers.get('activate')?.()
    expect(mocks.createWindow).toHaveBeenCalledOnce()
  })
})
