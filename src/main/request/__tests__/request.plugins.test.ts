import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPluginConfigs = vi.fn()
const getPlugins = vi.fn()
const getRequestAdapterPluginById = vi.fn()
const isRequestAdapterPluginEnabled = vi.fn()
const resolveAdapterForRequest = vi.fn()

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@main/db/plugins', () => ({
  pluginDb: {
    getPluginConfigs,
    getPlugins
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

    await expect(unifiedChatRequest({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello', segments: [] }],
      stream: false
    } as IUnifiedRequest, null, beforeFetch, afterFetch)).rejects.toThrow(
      'Request adapter plugin disabled: OpenAI Chat Compatible Adapter'
    )

    expect(beforeFetch).not.toHaveBeenCalled()
    expect(afterFetch).not.toHaveBeenCalled()
  })
})
