import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp'),
    isReady: vi.fn(() => false)
  },
  net: {}
}))

import { LocalPluginCatalogService } from '../LocalPluginCatalogService'
import { LocalPluginInstallService } from '../LocalPluginInstallService'
import { RemotePluginInstallService } from '../RemotePluginInstallService'

describe('RemotePluginInstallService', () => {
  let catalogService: LocalPluginCatalogService
  let localInstallService: LocalPluginInstallService

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-plugin-install-test-'))
    catalogService = new LocalPluginCatalogService()
    localInstallService = new LocalPluginInstallService(catalogService)
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    userDataPath = ''
  })

  it('downloads a remote plugin directory and installs it into the local plugin root', async () => {
    const plugin: RemotePluginCatalogItem = {
      pluginId: 'openai-response-compatible-adapter',
      path: 'openai-response-compatible-adapter',
      name: 'OpenAI Responses Compatible Adapter',
      version: '0.1.0',
      description: 'Remote adapter',
      manifest: 'openai-response-compatible-adapter/plugin.json',
      readme: 'openai-response-compatible-adapter/README.md',
      entries: { main: 'dist/main.js' },
      capabilities: [{
        kind: 'request-adapter',
        providerType: 'openai-response',
        modelTypes: ['llm', 'vlm']
      }],
      repo: 'gnl00/atiapp-plugins',
      ref: 'main'
    }

    const registryService = {
      listAvailablePlugins: vi.fn(async () => [plugin])
    }

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/contents/openai-response-compatible-adapter?')) {
        return {
          ok: true,
          json: async () => ([
            {
              type: 'file',
              path: 'openai-response-compatible-adapter/plugin.json',
              download_url: 'https://download/plugin.json'
            },
            {
              type: 'dir',
              path: 'openai-response-compatible-adapter/dist'
            }
          ])
        }
      }

      if (url.includes('/contents/openai-response-compatible-adapter/dist?')) {
        return {
          ok: true,
          json: async () => ([
            {
              type: 'file',
              path: 'openai-response-compatible-adapter/dist/main.js',
              download_url: 'https://download/dist/main.js'
            }
          ])
        }
      }

      if (url === 'https://download/plugin.json') {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from(JSON.stringify({
            id: 'openai-response-compatible-adapter',
            name: 'OpenAI Responses Compatible Adapter',
            version: '0.1.0',
            description: 'Remote adapter',
            capabilities: [{
              kind: 'request-adapter',
              providerType: 'openai-response',
              modelTypes: ['llm', 'vlm']
            }],
            entries: {
              main: './dist/main.js'
            }
          }))
        }
      }

      if (url === 'https://download/dist/main.js') {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from('export default { requestAdapter: {} }')
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    const service = new RemotePluginInstallService(
      registryService as any,
      localInstallService,
      fetchMock as unknown as typeof fetch
    )

    const result = await service.install('openai-response-compatible-adapter')
    const installRoot = path.join(userDataPath, 'plugins', 'openai-response-compatible-adapter')

    expect(result.plugin.pluginId).toBe('openai-response-compatible-adapter')
    expect(result.installRoot).toBe(installRoot)
    await expect(fs.readFile(path.join(installRoot, 'plugin.json'), 'utf-8')).resolves.toContain('"id":"openai-response-compatible-adapter"')
    await expect(fs.readFile(path.join(installRoot, 'dist', 'main.js'), 'utf-8')).resolves.toContain('requestAdapter')
  })
})
