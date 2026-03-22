import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveAdapterForRequest, adapterManager } from '..'

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
  let tempRoot = ''

  afterEach(async () => {
    adapterManager.clear()
    vi.restoreAllMocks()
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
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

  it('loads and caches the requested local request adapter plugin only', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-plugin-test-'))
    const manifestPath = path.join(tempRoot, 'plugin.json')
    const entryPath = path.join(tempRoot, 'main.mjs')

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        id: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'gemini',
          modelTypes: ['llm', 'vlm']
        }],
        entries: {
          main: './main.mjs'
        }
      }),
      'utf-8'
    )

    await fs.writeFile(
      entryPath,
      `
      export const requestAdapter = {
        providerType: 'gemini',
        streamProtocol: 'sse',
        supportsStreamOptionsUsage: false,
        request({ request }) {
          return {
            endpoint: request.baseUrl + '/models/test:generateContent',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
            body: { model: request.model, contents: [] }
          }
        },
        parseResponse({ raw }) {
          return { id: '1', model: 'gemini', timestamp: Date.now(), content: '', finishReason: 'stop', raw }
        },
        parseStreamResponse() { return null }
      }
      `,
      'utf-8'
    )

    const plugins: PluginEntity[] = [
      {
        pluginId: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        enabled: true,
        source: 'local',
        status: 'installed',
        manifestPath,
        installRoot: tempRoot,
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm', 'vlm']
          }
        }]
      }
    ]

    const first = await resolveAdapterForRequest('gemini-compatible-adapter', plugins)
    const second = await resolveAdapterForRequest('gemini-compatible-adapter', plugins)

    expect(adapterManager.listAdapters()).toEqual(['gemini-compatible-adapter'])
    expect(first).toBe(second)
  })

  it('caches local plugin load failures for the same fingerprint', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'broken-plugin-test-'))
    const manifestPath = path.join(tempRoot, 'plugin.json')

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        id: 'broken-adapter',
        name: 'Broken Adapter',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'gemini',
          modelTypes: ['llm']
        }],
        entries: {
          main: './missing.mjs'
        }
      }),
      'utf-8'
    )

    const statSpy = vi.spyOn(fs, 'stat')

    const plugins: PluginEntity[] = [
      {
        pluginId: 'broken-adapter',
        name: 'Broken Adapter',
        enabled: true,
        source: 'local',
        status: 'installed',
        manifestPath,
        installRoot: tempRoot,
        capabilities: [{
          kind: 'request-adapter',
          data: {
            providerType: 'gemini',
            modelTypes: ['llm']
          }
        }]
      }
    ]

    await expect(resolveAdapterForRequest('broken-adapter', plugins)).rejects.toThrow()
    await expect(resolveAdapterForRequest('broken-adapter', plugins)).rejects.toThrow()

    expect(statSpy).toHaveBeenCalledTimes(1)
    expect(adapterManager.listAdapters()).toEqual([])
    expect(adapterManager.getFailedAdapter('broken-adapter')).toBeDefined()
  })
})
