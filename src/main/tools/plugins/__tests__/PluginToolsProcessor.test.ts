import { beforeEach, describe, expect, it, vi } from 'vitest'
import DatabaseService from '@main/db/DatabaseService'
import { processListPlugins, processPluginInstall, processPluginUninstall } from '../PluginToolsProcessor'

const { loadPluginManifestFromDirectoryMock, emitPluginsUpdatedMock } = vi.hoisted(() => ({
  loadPluginManifestFromDirectoryMock: vi.fn(),
  emitPluginsUpdatedMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getWorkspacePathByUuid: vi.fn(),
    importLocalPluginFromDirectory: vi.fn(),
    getPlugins: vi.fn(),
    uninstallLocalPlugin: vi.fn()
  }
}))

vi.mock('@main/services/plugins', () => ({
  LocalPluginCatalogService: class {
    loadPluginManifestFromDirectory = loadPluginManifestFromDirectoryMock
  },
  pluginEventEmitter: {
    emitPluginsUpdated: emitPluginsUpdatedMock
  }
}))

describe('PluginToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs a local plugin from a directory and returns the installed plugin', async () => {
    loadPluginManifestFromDirectoryMock.mockResolvedValue({
      pluginId: 'google-gemini-compatible-adapter-typescript',
      status: 'installed'
    })

    vi.mocked(DatabaseService.importLocalPluginFromDirectory).mockResolvedValue([
      {
        pluginId: 'google-gemini-compatible-adapter-typescript',
        name: 'Google Gemini Compatible Adapter',
        source: 'local',
        enabled: true,
        status: 'installed',
        capabilities: []
      } as PluginEntity
    ])

    const result = await processPluginInstall({
      source: '/tmp/google-gemini-compatible-adapter-typescript'
    })

    expect(loadPluginManifestFromDirectoryMock).toHaveBeenCalledWith('/tmp/google-gemini-compatible-adapter-typescript')
    expect(DatabaseService.importLocalPluginFromDirectory).toHaveBeenCalledWith('/tmp/google-gemini-compatible-adapter-typescript')
    expect(result.success).toBe(true)
    expect(result.plugin?.pluginId).toBe('google-gemini-compatible-adapter-typescript')
  })

  it('lists installed plugins with concise metadata', async () => {
    vi.mocked(DatabaseService.getPlugins).mockReturnValue([
      {
        pluginId: 'google-gemini-compatible-adapter-typescript',
        name: 'Google Gemini Compatible Adapter',
        source: 'local',
        enabled: true,
        version: '0.1.0',
        status: 'installed',
        description: 'Gemini adapter',
        capabilities: [{ kind: 'request-adapter' }]
      } as PluginEntity
    ])

    const result = await processListPlugins()

    expect(result.success).toBe(true)
    expect(result.plugins).toEqual([
      expect.objectContaining({
        pluginId: 'google-gemini-compatible-adapter-typescript',
        name: 'Google Gemini Compatible Adapter',
        source: 'local',
        enabled: true,
        version: '0.1.0',
        status: 'installed',
        capabilities: ['request-adapter']
      })
    ])
  })

  it('fails to uninstall a built-in plugin', async () => {
    vi.mocked(DatabaseService.getPlugins).mockReturnValue([
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        source: 'built-in',
        enabled: true,
        status: 'installed',
        capabilities: []
      } as PluginEntity
    ])

    const result = await processPluginUninstall({
      pluginId: 'openai-chat-compatible-adapter'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('built-in')
    expect(DatabaseService.uninstallLocalPlugin).not.toHaveBeenCalled()
  })

  it('uninstalls a local plugin by pluginId', async () => {
    vi.mocked(DatabaseService.getPlugins).mockReturnValue([
      {
        pluginId: 'openai-response-compatible-adapter',
        name: 'OpenAI Responses Compatible Adapter',
        source: 'local',
        enabled: true,
        status: 'installed',
        capabilities: []
      } as PluginEntity
    ])

    const result = await processPluginUninstall({
      pluginId: 'openai-response-compatible-adapter'
    })

    expect(DatabaseService.uninstallLocalPlugin).toHaveBeenCalledWith('openai-response-compatible-adapter')
    expect(result.success).toBe(true)
    expect(result.removed).toBe(true)
  })
})
