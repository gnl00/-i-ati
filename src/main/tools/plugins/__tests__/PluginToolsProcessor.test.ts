import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pluginDb } from '@main/db/plugins'
import { processListPlugins, processPluginInstall, processPluginUninstall } from '../PluginToolsProcessor'

const { inspectLocalPluginDirectoryMock, emitPluginsUpdatedMock } = vi.hoisted(() => ({
  inspectLocalPluginDirectoryMock: vi.fn(),
  emitPluginsUpdatedMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getWorkspacePathByUuid: vi.fn()
  }
}))

vi.mock('@main/db/plugins', () => ({
  pluginDb: {
    inspectLocalPluginDirectory: inspectLocalPluginDirectoryMock,
    importLocalPluginFromDirectory: vi.fn(),
    getPlugins: vi.fn(),
    uninstallLocalPlugin: vi.fn()
  }
}))

vi.mock('@main/services/plugins', () => ({
  pluginEventEmitter: {
    emitPluginsUpdated: emitPluginsUpdatedMock
  }
}))

describe('PluginToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs a local plugin from a directory and returns the installed plugin', async () => {
    inspectLocalPluginDirectoryMock.mockResolvedValue({
      pluginId: 'google-gemini-compatible-adapter-typescript',
      status: 'installed'
    })

    vi.mocked(pluginDb.importLocalPluginFromDirectory).mockResolvedValue([
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

    expect(inspectLocalPluginDirectoryMock).toHaveBeenCalledWith('/tmp/google-gemini-compatible-adapter-typescript')
    expect(pluginDb.importLocalPluginFromDirectory).toHaveBeenCalledWith('/tmp/google-gemini-compatible-adapter-typescript')
    expect(result.success).toBe(true)
    expect(result.plugin?.pluginId).toBe('google-gemini-compatible-adapter-typescript')
  })

  it('lists installed plugins with concise metadata', async () => {
    vi.mocked(pluginDb.getPlugins).mockReturnValue([
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
    vi.mocked(pluginDb.getPlugins).mockReturnValue([
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
    expect(pluginDb.uninstallLocalPlugin).not.toHaveBeenCalled()
  })

  it('uninstalls a local plugin by pluginId', async () => {
    vi.mocked(pluginDb.getPlugins).mockReturnValue([
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

    expect(pluginDb.uninstallLocalPlugin).toHaveBeenCalledWith('openai-response-compatible-adapter')
    expect(result.success).toBe(true)
    expect(result.removed).toBe(true)
  })
})
