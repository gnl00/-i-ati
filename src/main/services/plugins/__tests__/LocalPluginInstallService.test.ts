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
import { LocalPluginInstallService } from '../LocalPluginInstallService'

describe('LocalPluginInstallService', () => {
  let catalogService: LocalPluginCatalogService
  let installService: LocalPluginInstallService

  beforeEach(async () => {
    userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-install-test-'))
    catalogService = new LocalPluginCatalogService()
    installService = new LocalPluginInstallService(catalogService)
  })

  afterEach(async () => {
    if (userDataPath) {
      await fs.rm(userDataPath, { recursive: true, force: true })
    }
    userDataPath = ''
  })

  it('imports a local plugin directory into userData/plugins/<pluginId>', async () => {
    const sourceDir = path.join(userDataPath, 'source', 'gemini-adapter')
    await fs.mkdir(path.join(sourceDir, 'dist'), { recursive: true })
    await fs.writeFile(
      path.join(sourceDir, 'plugin.json'),
      JSON.stringify({
        id: 'gemini-compatible-adapter',
        name: 'Gemini Compatible Adapter',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'openai',
          modelTypes: ['llm']
        }],
        entries: {
          main: './dist/main.js'
        }
      }),
      'utf-8'
    )
    await fs.writeFile(path.join(sourceDir, 'dist', 'main.js'), 'export default { requestAdapter: {} }', 'utf-8')

    const installRoot = await installService.importFromDirectory(sourceDir)

    expect(installRoot).toBe(path.join(userDataPath, 'plugins', 'gemini-compatible-adapter'))
    const manifestContent = await fs.readFile(path.join(installRoot, 'plugin.json'), 'utf-8')
    expect(JSON.parse(manifestContent)).toMatchObject({
      id: 'gemini-compatible-adapter',
      name: 'Gemini Compatible Adapter'
    })
  })

  it('rejects importing a plugin when entries.main is missing', async () => {
    const sourceDir = path.join(userDataPath, 'source', 'broken-adapter')
    await fs.mkdir(sourceDir, { recursive: true })
    await fs.writeFile(
      path.join(sourceDir, 'plugin.json'),
      JSON.stringify({
        id: 'broken-adapter',
        name: 'Broken Adapter',
        version: '1.0.0',
        capabilities: [{
          kind: 'request-adapter',
          providerType: 'openai',
          modelTypes: ['llm']
        }],
        entries: {
          main: './dist/main.js'
        }
      }),
      'utf-8'
    )

    await expect(installService.importFromDirectory(sourceDir)).rejects.toThrow('missing entries.main file')
  })

  it('uninstalls a local plugin by removing its install directory', async () => {
    const installDir = path.join(userDataPath, 'plugins', 'gemini-compatible-adapter')
    await fs.mkdir(installDir, { recursive: true })
    await fs.writeFile(path.join(installDir, 'plugin.json'), '{}', 'utf-8')

    await installService.uninstall('gemini-compatible-adapter')

    await expect(fs.stat(installDir)).rejects.toThrow()
  })
})
