import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getPluginConfigs,
  getPlugins,
  loggerInfoMock,
  loggerErrorMock,
  isRequestAdapterPluginEnabledMock,
  resolveAdapterForRequestMock
} = vi.hoisted(() => ({
  getPluginConfigs: vi.fn(() => []),
  getPlugins: vi.fn(() => []),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  isRequestAdapterPluginEnabledMock: vi.fn(() => true),
  resolveAdapterForRequestMock: vi.fn()
}))

vi.mock('@main/db/plugins', () => ({
  pluginDb: {
    getPluginConfigs,
    getPlugins
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: vi.fn(),
    error: loggerErrorMock
  }))
}))

vi.mock('../adapters/index', () => ({
  getRequestAdapterPluginById: vi.fn(),
  isRequestAdapterPluginEnabled: isRequestAdapterPluginEnabledMock,
  resolveAdapterForRequest: resolveAdapterForRequestMock
}))

describe('unifiedChatRequest logging', () => {
  beforeEach(() => {
    vi.resetModules()
    loggerInfoMock.mockReset()
    loggerErrorMock.mockReset()
    isRequestAdapterPluginEnabledMock.mockReset()
    isRequestAdapterPluginEnabledMock.mockReturnValue(true)
    resolveAdapterForRequestMock.mockReset()

    resolveAdapterForRequestMock.mockResolvedValue({
      buildHeaders: vi.fn(() => ({ authorization: 'Bearer test' })),
      buildRequest: vi.fn(() => ({
        model: 'test-model',
        messages: []
      })),
      supportsStreamOptionsUsage: vi.fn(() => false),
      getEndpoint: vi.fn(() => 'https://example.invalid/v1/responses'),
      transformStreamResponse: vi.fn(),
      parseResponse: vi.fn()
    })
  })

  it('logs structured request failure details for fetch transport errors', async () => {
    const fetchError = new TypeError('fetch failed') as TypeError & {
      cause?: { name: string; message: string; code: string }
    }
    fetchError.cause = {
      name: 'SocketError',
      message: 'socket hang up',
      code: 'ECONNRESET'
    }

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw fetchError
    }))

    const beforeFetch = vi.fn()
    const afterFetch = vi.fn()
    const { unifiedChatRequest } = await import('../index')

    await expect(unifiedChatRequest({
      adapterPluginId: 'openai-response-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      stream: true
    } as IUnifiedRequest, null, beforeFetch, afterFetch)).rejects.toThrow('fetch failed')

    expect(loggerInfoMock).toHaveBeenCalledWith('request.dispatch', expect.objectContaining({
      baseUrl: 'https://example.invalid/v1',
      adapterPluginId: 'openai-response-compatible-adapter',
      model: 'test-model',
      endpoint: 'https://example.invalid/v1/responses',
      stream: true
    }))
    expect(loggerErrorMock).toHaveBeenCalledWith('request.failed', expect.objectContaining({
      baseUrl: 'https://example.invalid/v1',
      adapterPluginId: 'openai-response-compatible-adapter',
      model: 'test-model',
      endpoint: 'https://example.invalid/v1/responses',
      stream: true,
      signalAborted: false,
      kind: 'network',
      retriable: true
    }))
    expect(loggerErrorMock).toHaveBeenLastCalledWith('request.failed', expect.objectContaining({
      name: 'TypeError',
      message: 'fetch failed',
      causeName: 'SocketError',
      causeMessage: 'socket hang up',
      causeCode: 'ECONNRESET'
    }))

    vi.unstubAllGlobals()
  })

  it('logs structured request failure details for abort errors', async () => {
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'AbortError'

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw abortError
    }))

    const beforeFetch = vi.fn()
    const afterFetch = vi.fn()
    const controller = new AbortController()
    controller.abort()

    const { unifiedChatRequest } = await import('../index')

    await expect(unifiedChatRequest({
      adapterPluginId: 'openai-response-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      stream: true
    } as IUnifiedRequest, controller.signal, beforeFetch, afterFetch)).rejects.toThrow('The operation was aborted.')

    expect(loggerErrorMock).toHaveBeenCalledWith('request.failed', expect.objectContaining({
      kind: 'abort',
      retriable: false,
      name: 'AbortError',
      message: 'The operation was aborted.',
      signalAborted: true
    }))

    vi.unstubAllGlobals()
  })

  it('logs structured request failure details for non-2xx http responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      text: async () => JSON.stringify({
        request_id: 'req_123',
        error: {
          message: 'rate limit exceeded'
        }
      })
    })))

    const beforeFetch = vi.fn()
    const afterFetch = vi.fn()
    const { unifiedChatRequest } = await import('../index')

    await expect(unifiedChatRequest({
      adapterPluginId: 'openai-response-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
      model: 'test-model',
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      stream: true
    } as IUnifiedRequest, null, beforeFetch, afterFetch)).rejects.toThrow('HTTP 429 Too Many Requests')

    expect(loggerErrorMock).toHaveBeenCalledTimes(1)
    expect(loggerErrorMock).toHaveBeenCalledWith('request.failed', expect.objectContaining({
      kind: 'http',
      retriable: true,
      status: 429,
      statusText: 'Too Many Requests',
      requestId: 'req_123',
      detail: JSON.stringify({
        request_id: 'req_123',
        error: {
          message: 'rate limit exceeded'
        }
      }),
      signalAborted: false
    }))

    vi.unstubAllGlobals()
  })
})
