import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userDataPath = ''

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataPath || '/tmp')
  }
}))

import { LocalPluginCatalogService } from '../LocalPluginCatalogService'

describe('LocalPluginCatalogService', () => {
  let service: LocalPluginCatalogService

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-catalog-test-'))
    service = new LocalPluginCatalogService()
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    userDataPath = ''
  })

  it('scans valid local plugin manifests from the userData plugins directory', async () => {
    const pluginDir = path.join(userDataPath, 'plugins', 'gemini-compatible')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        version: '1.0.0',
        description: 'Local test plugin',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'openai',
          modelTypes: ['llm']
        }]
      }),
      'utf-8'
    )

    const plugins = await service.scanInstalledPlugins()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      pluginId: 'gemini-compatible-adapter',
      displayName: 'Gemini Compatible Adapter',
      status: 'installed'
    })
  })

  it('returns invalid local plugin entries when manifest parsing fails', async () => {
    const pluginDir = path.join(userDataPath, 'plugins', 'broken-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(path.join(pluginDir, 'plugin.json'), '{ invalid json', 'utf-8')

    const plugins = await service.scanInstalledPlugins()

    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      pluginId: 'broken-plugin',
      status: 'invalid'
    })
    expect(plugins[0]?.lastError).toContain('Invalid plugin manifest')
  })
})
