import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DB_PROVIDER_ACCOUNTS_GET_ALL,
  DB_PROVIDER_ACCOUNT_DELETE,
  DB_PROVIDER_ACCOUNT_SAVE,
  DB_PROVIDER_DEFINITIONS_GET_ALL,
  DB_PROVIDER_DEFINITION_DELETE,
  DB_PROVIDER_DEFINITION_SAVE,
  DB_PROVIDER_MODEL_DELETE,
  DB_PROVIDER_MODEL_SAVE,
  DB_PROVIDER_MODEL_SET_ENABLED,
  PROVIDER_TEST_CONNECTION
} from '@shared/constants'

const { ipcMainHandleMock, testConnectionMock } = vi.hoisted(() => ({
  ipcMainHandleMock: vi.fn(),
  testConnectionMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMainHandleMock
  }
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    getProviderDefinitions: vi.fn(),
    saveProviderDefinition: vi.fn(),
    deleteProviderDefinition: vi.fn(),
    getProviderAccounts: vi.fn(),
    saveProviderAccount: vi.fn(),
    deleteProviderAccount: vi.fn(),
    saveProviderModel: vi.fn(),
    deleteProviderModel: vi.fn(),
    setProviderModelEnabled: vi.fn()
  }
}))

vi.mock('@main/services/providers/ProviderConnectionTestService', () => ({
  ProviderConnectionTestService: class {
    testConnection = testConnectionMock
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

describe('registerProviderHandlers', () => {
  beforeEach(() => {
    ipcMainHandleMock.mockReset()
    testConnectionMock.mockReset()
  })

  it('registers provider database and test handlers', async () => {
    const { registerProviderHandlers } = await import('../providers')

    registerProviderHandlers()

    const registeredChannels = ipcMainHandleMock.mock.calls.map(([channel]) => channel)
    expect(registeredChannels).toContain(DB_PROVIDER_DEFINITIONS_GET_ALL)
    expect(registeredChannels).toContain(DB_PROVIDER_DEFINITION_SAVE)
    expect(registeredChannels).toContain(DB_PROVIDER_DEFINITION_DELETE)
    expect(registeredChannels).toContain(DB_PROVIDER_ACCOUNTS_GET_ALL)
    expect(registeredChannels).toContain(DB_PROVIDER_ACCOUNT_SAVE)
    expect(registeredChannels).toContain(DB_PROVIDER_ACCOUNT_DELETE)
    expect(registeredChannels).toContain(DB_PROVIDER_MODEL_SAVE)
    expect(registeredChannels).toContain(DB_PROVIDER_MODEL_DELETE)
    expect(registeredChannels).toContain(DB_PROVIDER_MODEL_SET_ENABLED)
    expect(registeredChannels).toContain(PROVIDER_TEST_CONNECTION)
  })

  it('delegates provider test requests to the connection test service', async () => {
    testConnectionMock.mockResolvedValue({
      ok: true,
      modelId: 'model-1',
      contentPreview: 'pong'
    })
    const request = {
      providerDefinition: {
        id: 'provider-1',
        displayName: 'Provider 1',
        adapterPluginId: 'adapter-1'
      },
      account: {
        id: 'account-1',
        providerId: 'provider-1',
        label: 'Account 1',
        apiUrl: 'https://example.test/v1',
        apiKey: 'key-1',
        models: [{
          id: 'model-1',
          label: 'Model 1',
          type: 'llm'
        }]
      }
    }
    const { registerProviderHandlers } = await import('../providers')

    registerProviderHandlers()
    const handler = ipcMainHandleMock.mock.calls.find(([channel]) => channel === PROVIDER_TEST_CONNECTION)?.[1]
    const response = await handler({}, request)

    expect(testConnectionMock).toHaveBeenCalledWith(request)
    expect(response).toEqual({
      ok: true,
      modelId: 'model-1',
      contentPreview: 'pong'
    })
  })
})
