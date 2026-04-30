import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MODELS_GET_MODEL_CAPABILITIES } from '@shared/constants'

const { ipcMainHandleMock, getModelCapabilitiesMock } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  getModelCapabilitiesMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/services/models/ModelsDevCacheService', () => ({
  modelsDevCacheService: {
    getModelCapabilities: getModelCapabilitiesMock
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

describe('registerModelsHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
    getModelCapabilitiesMock.mockReset()
  })

  it('registers the model capabilities handler', async () => {
    const { registerModelsHandlers } = await import('../models')

    registerModelsHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain(MODELS_GET_MODEL_CAPABILITIES)
  })

  it('passes model ids to the cache service', async () => {
    getModelCapabilitiesMock.mockResolvedValue({ models: {} })
    const { registerModelsHandlers } = await import('../models')

    registerModelsHandlers()
    const handler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === MODELS_GET_MODEL_CAPABILITIES)?.[1]
    await handler({}, { modelIds: ['gpt-5'] })

    expect(getModelCapabilitiesMock).toHaveBeenCalledWith(['gpt-5'])
  })
})
