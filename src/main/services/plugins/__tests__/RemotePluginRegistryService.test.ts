import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isReady: vi.fn(() => false),
    getPath: vi.fn(() => '/tmp')
  }
}))

import { RemotePluginRegistryService } from '../RemotePluginRegistryService'

describe('RemotePluginRegistryService', () => {
  it('returns normalized remote plugin catalog items from a valid registry document', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        repo: 'gnl00/atiapp-plugins',
        ref: 'main',
        plugins: [
          {
            id: 'openai-response-compatible-adapter',
            path: 'openai-response-compatible-adapter',
            name: 'OpenAI Responses Compatible Adapter',
            version: '0.1.0',
            description: 'Remote adapter',
            manifest: 'openai-response-compatible-adapter/plugin.json',
            readme: 'openai-response-compatible-adapter/README.md',
            entries: {
              main: 'dist/main.js'
            },
            capabilities: [
              {
                kind: 'request-adapter',
                providerType: 'openai-response',
                modelTypes: ['llm', 'vlm']
              }
            ]
          }
        ]
      })
    }))

    const service = new RemotePluginRegistryService(fetchMock as unknown as typeof fetch, 'https://example.com/registry.json')
    const items = await service.listAvailablePlugins()

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/registry.json')
    expect(items).toEqual([
      expect.objectContaining({
        pluginId: 'openai-response-compatible-adapter',
        path: 'openai-response-compatible-adapter',
        repo: 'gnl00/atiapp-plugins',
        ref: 'main',
        entries: { main: 'dist/main.js' }
      })
    ])
  })

  it('rejects registry entries with duplicate plugin ids', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        repo: 'gnl00/atiapp-plugins',
        ref: 'main',
        plugins: [
          {
            id: 'dup',
            path: 'plugin-a',
            name: 'Plugin A',
            version: '0.1.0',
            manifest: 'plugin-a/plugin.json',
            entries: { main: 'dist/main.js' },
            capabilities: [{ kind: 'request-adapter', providerType: 'gemini', modelTypes: ['llm'] }]
          },
          {
            id: 'dup',
            path: 'plugin-b',
            name: 'Plugin B',
            version: '0.1.0',
            manifest: 'plugin-b/plugin.json',
            entries: { main: 'dist/main.js' },
            capabilities: [{ kind: 'request-adapter', providerType: 'openai-response', modelTypes: ['llm'] }]
          }
        ]
      })
    }))

    const service = new RemotePluginRegistryService(fetchMock as unknown as typeof fetch)

    await expect(service.listAvailablePlugins()).rejects.toThrow('Duplicate plugin id')
  })

  it('rejects unsafe relative paths in registry entries', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        repo: 'gnl00/atiapp-plugins',
        ref: 'main',
        plugins: [
          {
            id: 'unsafe-plugin',
            path: '../unsafe-plugin',
            name: 'Unsafe Plugin',
            version: '0.1.0',
            manifest: '../unsafe-plugin/plugin.json',
            entries: { main: 'dist/main.js' },
            capabilities: [{ kind: 'request-adapter', providerType: 'gemini', modelTypes: ['llm'] }]
          }
        ]
      })
    }))

    const service = new RemotePluginRegistryService(fetchMock as unknown as typeof fetch)

    await expect(service.listAvailablePlugins()).rejects.toThrow('must be a safe relative path')
  })
})
