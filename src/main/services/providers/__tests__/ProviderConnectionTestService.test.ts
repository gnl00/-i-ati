import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderTestConnectionRequest } from '@shared/providers/testConnection'

const { getRequestErrorMetadataMock } = vi.hoisted(() => ({
  getRequestErrorMetadataMock: vi.fn()
}))

vi.mock('@main/request/index', () => ({
  getRequestErrorMetadata: getRequestErrorMetadataMock,
  unifiedChatRequest: vi.fn()
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

const createProviderDefinition = (): ProviderDefinition => ({
    id: 'provider-1',
    displayName: 'Provider 1',
    adapterPluginId: 'adapter-1',
    requestOverrides: {
      temperature: 0
    }
})

const createAccount = (): ProviderAccount => ({
    id: 'account-1',
    providerId: 'provider-1',
    label: 'Account 1',
    apiUrl: 'https://example.test/v1',
    apiKey: 'key-1',
    models: [{
      id: 'model-1',
      label: 'Model 1',
      type: 'llm',
      enabled: false
    }, {
      id: 'model-2',
      label: 'Model 2',
      type: 'llm',
      enabled: true
    }]
})

const createInput = (
  overrides: Partial<ProviderTestConnectionRequest> = {}
): ProviderTestConnectionRequest => ({
  providerDefinition: overrides.providerDefinition ?? createProviderDefinition(),
  account: overrides.account ?? createAccount()
})

describe('ProviderConnectionTestService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRequestErrorMetadataMock.mockReturnValue(undefined)
  })

  it('sends ping with the first enabled provider model', async () => {
    const requestMock = vi.fn().mockResolvedValue({ content: 'pong' })
    const { ProviderConnectionTestService } = await import('../ProviderConnectionTestService')
    const service = new ProviderConnectionTestService({
      request: requestMock,
      timeoutMs: 1000
    })

    const response = await service.testConnection(createInput())

    expect(response).toEqual({
      ok: true,
      modelId: 'model-2',
      contentPreview: 'pong'
    })
    expect(requestMock).toHaveBeenCalledTimes(1)
    expect(requestMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      adapterPluginId: 'adapter-1',
      baseUrl: 'https://example.test/v1',
      apiKey: 'key-1',
      model: 'model-2',
      modelType: 'llm',
      stream: false,
      requestOverrides: {
        temperature: 0,
        stream: false
      },
      messages: [{
        role: 'user',
        content: 'ping'
      }]
    }))
  })

  it('marks empty response content as failed', async () => {
    const requestMock = vi.fn().mockResolvedValue({ content: '   ' })
    const { ProviderConnectionTestService } = await import('../ProviderConnectionTestService')
    const service = new ProviderConnectionTestService({
      request: requestMock,
      timeoutMs: 1000
    })

    const response = await service.testConnection(createInput())

    expect(response).toEqual({
      ok: false,
      modelId: 'model-2',
      error: 'Provider returned empty content'
    })
  })

  it('returns request error metadata when the provider request fails', async () => {
    const requestMock = vi.fn().mockRejectedValue(new Error('request failed'))
    getRequestErrorMetadataMock.mockReturnValueOnce({
      kind: 'http',
      retriable: false,
      message: 'HTTP 401 Unauthorized'
    })
    const { ProviderConnectionTestService } = await import('../ProviderConnectionTestService')
    const service = new ProviderConnectionTestService({
      request: requestMock,
      timeoutMs: 1000
    })

    const response = await service.testConnection(createInput())

    expect(response).toEqual({
      ok: false,
      modelId: 'model-2',
      error: 'HTTP 401 Unauthorized'
    })
  })

  it('fails before requesting when the account has no enabled models', async () => {
    const requestMock = vi.fn()
    const { ProviderConnectionTestService } = await import('../ProviderConnectionTestService')
    const service = new ProviderConnectionTestService({
      request: requestMock,
      timeoutMs: 1000
    })

    const response = await service.testConnection(createInput({
      account: {
        id: 'account-1',
        providerId: 'provider-1',
        label: 'Account 1',
        apiUrl: 'https://example.test/v1',
        apiKey: 'key-1',
        models: [{
          id: 'model-1',
          label: 'Model 1',
          type: 'llm',
          enabled: false
        }]
      }
    }))

    expect(response).toEqual({
      ok: false,
      modelId: '',
      error: 'Missing enabled provider model'
    })
    expect(requestMock).toHaveBeenCalledTimes(0)
  })
})
