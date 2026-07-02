import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  netFetch: vi.fn(),
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('electron', () => ({
  net: {
    fetch: mocks.netFetch
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

const createAccount = (overrides: Partial<ProviderAccount> = {}): ProviderAccount => ({
  id: 'account-1',
  providerId: 'provider-1',
  label: 'Primary',
  apiUrl: 'https://ark.example.com/api/v3/',
  apiKey: 'sk-secret-value',
  models: [],
  ...overrides
})

describe('ProviderModelsFetchService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches models through Electron net.fetch by default', async () => {
    mocks.netFetch.mockResolvedValue(new Response(JSON.stringify({
      object: 'list',
      data: [
        { id: 'gpt-4o-mini' }
      ]
    }), {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }))

    const { ProviderModelsFetchService } = await import('../ProviderModelsFetchService')
    const service = new ProviderModelsFetchService({ timeoutMs: 1000 })

    const response = await service.fetchModels({
      account: createAccount()
    })

    expect(mocks.netFetch).toHaveBeenCalledWith('https://ark.example.com/api/v3/models', expect.objectContaining({
      method: 'GET',
      headers: {
        Authorization: 'Bearer sk-secret-value',
        Accept: 'application/json'
      }
    }))
    expect(response).toEqual({
      ok: true,
      endpoint: 'https://ark.example.com/api/v3/models',
      models: [{
        id: 'gpt-4o-mini',
        label: 'gpt-4o-mini',
        type: 'mllm',
        enabled: true
      }]
    })
  })

  it('uses an injected fetch implementation for tests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'text-model' }
      ]
    })))
    const { ProviderModelsFetchService } = await import('../ProviderModelsFetchService')
    const service = new ProviderModelsFetchService({
      fetchImpl,
      timeoutMs: 1000
    })

    const response = await service.fetchModels({
      account: createAccount()
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(mocks.netFetch).toHaveBeenCalledTimes(0)
    expect(response).toMatchObject({
      ok: true,
      models: [{
        id: 'text-model'
      }]
    })
  })

  it('returns stable HTTP errors from JSON bodies without leaking the API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'invalid token sk-secret-value'
      }
    }), {
      status: 401,
      statusText: 'Unauthorized'
    }))
    const { ProviderModelsFetchService } = await import('../ProviderModelsFetchService')
    const service = new ProviderModelsFetchService({
      fetchImpl,
      timeoutMs: 1000
    })

    const response = await service.fetchModels({
      account: createAccount()
    })

    expect(response).toEqual({
      ok: false,
      endpoint: 'https://ark.example.com/api/v3/models',
      status: 401,
      error: 'HTTP 401 Unauthorized: invalid token [redacted-api-key]'
    })
  })

  it('returns stable HTTP errors from text bodies', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('upstream unavailable', {
      status: 503,
      statusText: 'Service Unavailable'
    }))
    const { ProviderModelsFetchService } = await import('../ProviderModelsFetchService')
    const service = new ProviderModelsFetchService({
      fetchImpl,
      timeoutMs: 1000
    })

    const response = await service.fetchModels({
      account: createAccount()
    })

    expect(response).toEqual({
      ok: false,
      endpoint: 'https://ark.example.com/api/v3/models',
      status: 503,
      error: 'HTTP 503 Service Unavailable: upstream unavailable'
    })
  })

  it('returns readable network errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    const { ProviderModelsFetchService } = await import('../ProviderModelsFetchService')
    const service = new ProviderModelsFetchService({
      fetchImpl,
      timeoutMs: 1000
    })

    const response = await service.fetchModels({
      account: createAccount()
    })

    expect(response).toEqual({
      ok: false,
      endpoint: 'https://ark.example.com/api/v3/models',
      error: 'fetch failed',
      status: undefined
    })
  })
})
