import { afterEach, describe, expect, it, vi } from 'vitest'
import { invalidateRequestAdapterCache, resolveAdapterForRequest, adapterManager } from '..'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
    isReady: vi.fn(() => false)
  },
  shell: {
    openExternal: vi.fn()
  },
  BrowserWindow: vi.fn(),
  session: {},
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}))

vi.mock('@main/main-window', () => ({
  mainWindow: null,
  createWindow: vi.fn(),
  getWinPosition: vi.fn(),
  pinWindow: vi.fn(),
  setWinPosition: vi.fn(),
  windowsClose: vi.fn(),
  windowsMaximize: vi.fn(),
  windowsMinimize: vi.fn()
}))

describe('request adapter resolution', () => {
  afterEach(async () => {
    adapterManager.clear()
    vi.restoreAllMocks()
  })

  it('resolves built-in adapters without touching unrelated broken local plugins', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const adapter = await resolveAdapterForRequest('openai-chat-compatible-adapter', [
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        enabled: true,
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
        pluginId: 'google-gemini-compatible-adapter-typescript',
        name: 'Google Gemini Compatible Adapter',
        enabled: true,
        source: 'local',
        status: 'installed',
        manifestPath: '/tmp/missing/plugin.json',
        installRoot: '/tmp/missing',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])

    expect(adapterManager.listAdapters()).toEqual(['openai-chat-compatible-adapter'])
    expect(adapter).toBe(adapterManager.getAdapter('openai-chat-compatible-adapter'))
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('rejects external request adapter plugin ids during adapter resolution', async () => {
    invalidateRequestAdapterCache()

    await expect(resolveAdapterForRequest('gemini-compatible-adapter', [
      {
        pluginId: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        enabled: true,
        source: 'local',
        status: 'installed',
        manifestPath: '/tmp/gemini/plugin.json',
        installRoot: '/tmp/gemini',
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ])).rejects.toThrow('No built-in adapter found for plugin id: gemini-compatible-adapter')

    expect(adapterManager.listAdapters()).toEqual([])
  })
})
