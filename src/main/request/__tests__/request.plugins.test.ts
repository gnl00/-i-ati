import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUnifiedRequest } from './helpers'

const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}))
const getConfig = vi.hoisted(() => vi.fn())
const writeRequestBody = vi.hoisted(() => vi.fn())

const getPluginConfigs = vi.fn()
const getPlugins = vi.fn()
const getRequestAdapterPluginById = vi.fn()
const isRequestAdapterPluginEnabled = vi.fn()
const resolveAdapterForRequest = vi.fn()

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: loggerMock.debug,
    info: loggerMock.info,
    warn: loggerMock.warn,
    error: loggerMock.error
  }))
}))

vi.mock('@main/db/plugins', () => ({
  pluginDb: {
    getPluginConfigs,
    getPlugins
  }
}))

vi.mock('@main/db/config', () => ({
  configDb: {
    getConfig
  }
}))

vi.mock('../RequestDebugLogger', () => ({
  RequestDebugLogger: class {
    writeRequestBody = writeRequestBody
  }
}))

vi.mock('../adapters/index', () => ({
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled,
  resolveAdapterForRequest
}))

describe('unifiedChatRequest plugin gating', () => {
  beforeEach(() => {
    getPluginConfigs.mockReset()
    getPlugins.mockReset()
    getRequestAdapterPluginById.mockReset()
    isRequestAdapterPluginEnabled.mockReset()
    resolveAdapterForRequest.mockReset()
    loggerMock.debug.mockReset()
    loggerMock.info.mockReset()
    loggerMock.warn.mockReset()
    loggerMock.error.mockReset()
    writeRequestBody.mockReset()
    getConfig.mockReset()
    getConfig.mockReturnValue({
      tools: {
        streamChunkDebugEnabled: false
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws a clear error when the corresponding adapter plugin is disabled', async () => {
    getPluginConfigs.mockReturnValue([
      {
        id: 'openai-chat-compatible-adapter',
        enabled: false
      },
      {
        id: 'openai-image-compatible-adapter',
        enabled: false
      },
      {
        id: 'claude-compatible-adapter',
        enabled: true
      }
    ])
    getPlugins.mockReturnValue([
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        enabled: false,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['llm', 'vlm', 'mllm']
          }
        }]
      },
      {
        pluginId: 'openai-image-compatible-adapter',
        name: 'OpenAI Image Compatible Adapter',
        enabled: false,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'openai',
            modelTypes: ['img_gen']
          }
        }]
      },
      {
        pluginId: 'claude-compatible-adapter',
        name: 'Claude Compatible Adapter',
        enabled: true,
        source: 'built-in',
        status: 'installed',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'claude',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])
    getRequestAdapterPluginById.mockImplementation((pluginId: string, plugins: PluginEntity[]) =>
      plugins.find(plugin => plugin.pluginId === pluginId)
    )
    isRequestAdapterPluginEnabled.mockReturnValue(false)

    const beforeFetch = vi.fn()
    const afterFetch = vi.fn()
    const { unifiedChatRequest } = await import('../index')

    await expect(unifiedChatRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      stream: false
    }), null, beforeFetch, afterFetch)).rejects.toThrow(
      'Request adapter plugin disabled: OpenAI Chat Compatible Adapter'
    )

    expect(beforeFetch).not.toHaveBeenCalled()
    expect(afterFetch).not.toHaveBeenCalled()
  })

  it('writes request body to the request debug log when request debug logging is enabled', async () => {
    getPluginConfigs.mockReturnValue([{ id: 'openai-chat-compatible-adapter', enabled: true }])
    getPlugins.mockReturnValue([])
    isRequestAdapterPluginEnabled.mockReturnValue(true)
    getConfig.mockReturnValue({
      tools: {
        streamChunkDebugEnabled: true
      }
    })

    const requestBody = {
      model: 'test-model',
      messages: [{
        role: 'user',
        content: 'debug me'
      }],
      apiKey: 'body-secret',
      stream: false
    }
    const adapter = {
      buildHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      buildRequest: vi.fn(() => requestBody),
      supportsStreamOptionsUsage: vi.fn(() => true),
      getEndpoint: vi.fn(() => 'https://example.invalid/v1/chat/completions'),
      parseResponse: vi.fn((raw: unknown) => ({
        id: 'response-id',
        model: 'test-model',
        timestamp: 1,
        content: JSON.stringify(raw),
        finishReason: 'stop'
      }))
    }
    resolveAdapterForRequest.mockResolvedValue(adapter)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const beforeFetch = vi.fn()
    const afterFetch = vi.fn()
    const { unifiedChatRequest } = await import('../index')

    await unifiedChatRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      model: 'test-model',
      stream: false
    }), null, beforeFetch, afterFetch)

    expect(loggerMock.info).toHaveBeenCalledWith('request.dispatch', {
      baseUrl: 'https://example.invalid/v1',
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'test-model',
      endpoint: 'https://example.invalid/v1/chat/completions',
      stream: false
    })
    expect(writeRequestBody).toHaveBeenCalledWith(expect.objectContaining({
      requestLogId: expect.any(String),
      time: expect.any(String),
      baseUrl: 'https://example.invalid/v1',
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'test-model',
      endpoint: 'https://example.invalid/v1/chat/completions',
      stream: false,
      body: requestBody,
      serializedBody: JSON.stringify(requestBody)
    }))
    expect(loggerMock.info).not.toHaveBeenCalledWith('request.body', expect.anything())
    expect(loggerMock.info).not.toHaveBeenCalledWith('request.body.chunk', expect.anything())
    expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/v1/chat/completions', expect.objectContaining({
      body: JSON.stringify(requestBody)
    }))
    expect(beforeFetch).toHaveBeenCalledTimes(1)
    expect(afterFetch).toHaveBeenCalledTimes(1)
  })

  it('applies selected payload extensions before request overrides', async () => {
    getPluginConfigs.mockReturnValue([{ id: 'openai-chat-compatible-adapter', enabled: true }])
    getPlugins.mockReturnValue([])
    isRequestAdapterPluginEnabled.mockReturnValue(true)
    getConfig.mockReturnValue({
      tools: {
        streamChunkDebugEnabled: false
      }
    })

    const requestBody = {
      model: 'test-model',
      messages: [{
        role: 'user',
        content: 'debug me'
      }],
      stream: false
    }
    const adapter = {
      buildHeaders: vi.fn(() => ({ 'content-type': 'application/json' })),
      buildRequest: vi.fn(() => requestBody),
      supportsStreamOptionsUsage: vi.fn(() => false),
      getEndpoint: vi.fn(() => 'https://example.invalid/v1/chat/completions'),
      parseResponse: vi.fn((raw: unknown) => ({
        id: 'response-id',
        model: 'test-model',
        timestamp: 1,
        content: JSON.stringify(raw),
        finishReason: 'stop'
      }))
    }
    resolveAdapterForRequest.mockResolvedValue(adapter)
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const { unifiedChatRequest } = await import('../index')

    await unifiedChatRequest(createTestUnifiedRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      model: 'test-model',
      stream: false,
      payloadExtensions: {
        thinking: 'deepseek-thinking'
      },
      options: {
        thinking: {
          enabled: true,
          effort: 'high'
        }
      },
      requestOverrides: {
        thinking: {
          type: 'disabled'
        }
      }
    }), null, vi.fn(), vi.fn())

    expect(fetchMock).toHaveBeenCalledWith('https://example.invalid/v1/chat/completions', expect.objectContaining({
      body: JSON.stringify({
        model: 'test-model',
        messages: [{
          role: 'user',
          content: 'debug me'
        }],
        stream: false,
        thinking: {
          type: 'disabled'
        },
        reasoning_effort: 'high'
      })
    }))
  })
})
