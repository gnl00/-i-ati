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
            id: 'deepseek-thinking',
            path: 'deepseek-thinking',
            name: 'DeepSeek Thinking',
            version: '0.1.0',
            description: 'Remote payload extension',
            manifest: 'deepseek-thinking/plugin.json',
            readme: 'deepseek-thinking/README.md',
            capabilities: [
              {
                kind: 'request-payload-extension',
                feature: 'thinking',
                thinking: {
                  levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
                  defaultLevel: 'medium'
                },
                matchHints: {
                  baseUrlKeywords: ['deepseek'],
                  modelKeywords: ['deepseek']
                },
                patches: {
                  thinking: {
                    enabled: [
                      { op: 'set', path: 'thinking.type', value: 'enabled' },
                      {
                        op: 'setFromThinkingEffort',
                        path: 'reasoning_effort',
                        allowedValues: ['low', 'medium', 'high']
                      }
                    ],
                    disabled: [
                      { op: 'set', path: 'thinking.type', value: 'disabled' },
                      { op: 'unset', path: 'reasoning_effort' }
                    ]
                  }
                }
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
        pluginId: 'deepseek-thinking',
        path: 'deepseek-thinking',
        repo: 'gnl00/atiapp-plugins',
        ref: 'main',
        entries: undefined,
        capabilities: [expect.objectContaining({
          kind: 'request-payload-extension',
          feature: 'thinking',
          thinking: {
            levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            defaultLevel: 'medium'
          },
          matchHints: {
            baseUrlKeywords: ['deepseek'],
            modelKeywords: ['deepseek']
          },
          patches: {
            thinking: {
              enabled: [
                { op: 'set', path: 'thinking.type', value: 'enabled' },
                {
                  op: 'setFromThinkingEffort',
                  path: 'reasoning_effort',
                  allowedValues: ['low', 'medium', 'high']
                }
              ],
              disabled: [
                { op: 'set', path: 'thinking.type', value: 'disabled' },
                { op: 'unset', path: 'reasoning_effort' }
              ]
            }
          }
        })]
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
            capabilities: [{ kind: 'request-payload-extension', feature: 'thinking' }]
          },
          {
            id: 'dup',
            path: 'plugin-b',
            name: 'Plugin B',
            version: '0.1.0',
            manifest: 'plugin-b/plugin.json',
            capabilities: [{ kind: 'request-payload-extension', feature: 'thinking' }]
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
            capabilities: [{ kind: 'request-payload-extension', feature: 'thinking' }]
          }
        ]
      })
    }))

    const service = new RemotePluginRegistryService(fetchMock as unknown as typeof fetch)

    await expect(service.listAvailablePlugins()).rejects.toThrow('must be a safe relative path')
  })
})
