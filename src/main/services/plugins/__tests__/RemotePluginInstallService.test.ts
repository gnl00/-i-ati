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

vi.mock('extract-zip', () => ({
  default: vi.fn()
}))

import { LocalPluginCatalogService } from '../LocalPluginCatalogService'
import { LocalPluginInstallService } from '../LocalPluginInstallService'
import { RemotePluginInstallService } from '../RemotePluginInstallService'
import extractZip from 'extract-zip'

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

  it('downloads a remote plugin archive and installs it into the local plugin root', async () => {
    const plugin: RemotePluginCatalogItem = {
      pluginId: 'deepseek-thinking',
      path: 'deepseek-thinking',
      name: 'DeepSeek Thinking',
      version: '0.1.0',
      description: 'Remote payload extension',
      manifest: 'deepseek-thinking/plugin.json',
      readme: 'deepseek-thinking/README.md',
      capabilities: [{
        kind: 'request-payload-extension',
        feature: 'thinking'
      }],
      repo: 'gnl00/atiapp-plugins',
      ref: 'main'
    }

    const registryService = {
      listAvailablePlugins: vi.fn(async () => [plugin])
    }

    const fetchMock = vi.fn(async (url: string) => {
      if (url === 'https://github.com/gnl00/atiapp-plugins/archive/main.zip') {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from('fake-zip-content')
        }
      }

      throw new Error(`Unexpected URL: ${url}`)
    })

    vi.mocked(extractZip).mockImplementation(async (_archivePath: string, options: { dir: string }) => {
      const extractedPluginRoot = path.join(options.dir, 'atiapp-plugins-main', 'deepseek-thinking')
      await fs.mkdir(extractedPluginRoot, { recursive: true })
      await fs.writeFile(
        path.join(extractedPluginRoot, 'plugin.json'),
        JSON.stringify({
          id: 'deepseek-thinking',
          name: 'DeepSeek Thinking',
          version: '0.1.0',
          description: 'Remote payload extension',
          capabilities: [{
            kind: 'request-payload-extension',
            feature: 'thinking'
          }]
        }),
        'utf-8'
      )
    })

    const service = new RemotePluginInstallService(
      registryService as any,
      localInstallService,
      fetchMock as unknown as typeof fetch
    )

    const result = await service.install('deepseek-thinking')
    const installRoot = path.join(userDataPath, 'plugins', 'deepseek-thinking')

    expect(result.plugin.pluginId).toBe('deepseek-thinking')
    expect(result.installRoot).toBe(installRoot)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://github.com/gnl00/atiapp-plugins/archive/main.zip',
      expect.any(Object)
    )
    await expect(fs.readFile(path.join(installRoot, 'plugin.json'), 'utf-8')).resolves.toContain('"id":"deepseek-thinking"')
  })
})
