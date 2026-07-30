import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  runtimeInitializeMock,
  runtimeIsReadyMock,
  runtimeCloseMock,
  appServicesConstructorMock,
  loggerInfoMock,
  loggerErrorMock
} = vi.hoisted(() => ({
  runtimeInitializeMock: vi.fn(),
  runtimeIsReadyMock: vi.fn(),
  runtimeCloseMock: vi.fn(),
  appServicesConstructorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn()
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: loggerInfoMock,
    error: loggerErrorMock
  }))
}))

vi.mock('@main/config/event-emitter', () => ({
  configEventEmitter: {
    emitUpdated: vi.fn()
  }
}))

vi.mock('@main/main-window', () => ({
  mainWindow: null
}))

vi.mock('../../core/DbRuntime', () => ({
  DbRuntime: class {
    initialize = runtimeInitializeMock
    isReady = runtimeIsReadyMock
    close = runtimeCloseMock
    pluginRepository = {}
    chatRepository = {}
    chatHostBindingRepository = {}
    messageRepository = {}
    emotionStateRepository = {}
    workContextRepository = {}
    configRepository = {}
    mcpServerRepository = {}
    providerRepository = {}
    taskPlanRepository = {}
    scheduledTaskRepository = {}
    runEventRepository = {}
    compressedSummaryRepository = {}
    smartMessageRepository = {}
  }
}))

vi.mock('../DbAppServices', () => ({
  DbAppServices: class {
    constructor(runtime: unknown) {
      appServicesConstructorMock(runtime)
    }
  }
}))

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    runtimeInitializeMock.mockReturnValue({ chats: 0, messages: 0 })
    runtimeIsReadyMock.mockReturnValue(true)
  })

  it('closes the db runtime when initialization fails after runtime assembly and retries cleanly', async () => {
    appServicesConstructorMock
      .mockImplementationOnce(() => {
        throw new Error('application service assembly failed')
      })
      .mockReturnValueOnce(undefined)

    const { default: databaseService } = await import('../DatabaseService')

    await expect(databaseService.initialize()).rejects.toThrow('application service assembly failed')
    expect(runtimeCloseMock).toHaveBeenCalledTimes(1)

    await expect(databaseService.initialize()).resolves.toBeUndefined()
    expect(runtimeInitializeMock).toHaveBeenCalledTimes(2)
    expect(appServicesConstructorMock).toHaveBeenCalledTimes(2)
  })
})
