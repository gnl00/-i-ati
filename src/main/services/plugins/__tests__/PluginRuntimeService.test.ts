import { describe, expect, it, vi } from 'vitest'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { PluginRuntimeService } from '../PluginRuntimeService'
import { RemotePluginInstallService } from '../RemotePluginInstallService'

describe('PluginRuntimeService', () => {
  it('rescans local plugins through the catalog service and syncs them into the plugin store', async () => {
    const manifests: PluginEntity[] = [{
      pluginId: 'local-plugin',
      name: 'Local Plugin',
      source: 'local',
      enabled: true,
      status: 'installed',
      capabilities: []
    }]
    const pluginStore = {
      getPluginConfigs: vi.fn(),
      savePluginConfigs: vi.fn(),
      getPlugins: vi.fn(),
      updatePluginSource: vi.fn(),
      savePluginSetting: vi.fn()
    }
    const pluginManifestSyncService = {
      syncLocalPluginManifests: vi.fn().mockReturnValue(manifests)
    }
    const localPluginCatalogService = {
      scanInstalledPlugins: vi.fn().mockResolvedValue([{
        pluginId: 'local-plugin',
        displayName: 'Local Plugin',
        manifestPath: '/tmp/local-plugin/plugin.json',
        installRoot: '/tmp/local-plugin',
        status: 'installed',
        capabilities: []
      }]),
      loadPluginManifestFromDirectory: vi.fn()
    }

    const service = new PluginRuntimeService({
      pluginStore,
      pluginManifestSyncService,
      localPluginCatalogService
    })

    await expect(service.rescanLocalPlugins()).resolves.toEqual(manifests)
    expect(localPluginCatalogService.scanInstalledPlugins).toHaveBeenCalledOnce()
    expect(pluginManifestSyncService.syncLocalPluginManifests).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ pluginId: 'local-plugin' })
    ]))
  })

  it('installs a remote plugin and persists remote metadata via the plugin store', async () => {
    const remotePlugin: RemotePluginCatalogItem = {
      pluginId: 'remote-plugin',
      name: 'Remote Plugin',
      version: '1.2.3',
      description: 'Remote plugin',
      manifest: 'remote-plugin/plugin.json',
      readme: 'remote-plugin/README.md',
      path: 'remote-plugin',
      entries: { main: 'dist/main.js' },
      capabilities: [{
        kind: 'request-adapter',
        providerType: 'openai',
        modelTypes: ['llm']
      }],
      repo: 'example/plugins',
      ref: 'main'
    }
    const plugins: PluginEntity[] = [{
      pluginId: 'remote-plugin',
      name: 'Remote Plugin',
      source: 'remote',
      enabled: true,
      version: '1.2.3',
      status: 'installed',
      capabilities: []
    }]
    const pluginStore = {
      getPluginConfigs: vi.fn(),
      savePluginConfigs: vi.fn(),
      getPlugins: vi.fn().mockReturnValue(plugins),
      updatePluginSource: vi.fn(),
      savePluginSetting: vi.fn()
    }
    const pluginManifestSyncService = {
      syncLocalPluginManifests: vi.fn().mockReturnValue(plugins)
    }
    const localPluginCatalogService = {
      scanInstalledPlugins: vi.fn().mockResolvedValue([{
        pluginId: 'remote-plugin',
        displayName: 'Remote Plugin',
        version: '1.2.3',
        manifestPath: '/tmp/remote-plugin/plugin.json',
        installRoot: '/tmp/remote-plugin',
        status: 'installed',
        capabilities: []
      }]),
      loadPluginManifestFromDirectory: vi.fn()
    }
    const remotePluginInstallService = {
      install: vi.fn().mockResolvedValue({
        plugin: remotePlugin,
        installRoot: '/tmp/remote-plugin'
      })
    }

    const service = new PluginRuntimeService({
      pluginStore,
      pluginManifestSyncService,
      localPluginCatalogService,
      remotePluginInstallService
    })

    await expect(service.installRemotePlugin('remote-plugin')).resolves.toEqual(plugins)
    expect(remotePluginInstallService.install).toHaveBeenCalledWith('remote-plugin')
    expect(pluginManifestSyncService.syncLocalPluginManifests).toHaveBeenCalled()
    expect(pluginStore.updatePluginSource).toHaveBeenCalledWith('remote-plugin', 'remote')
    expect(pluginStore.savePluginSetting).toHaveBeenCalledWith(
      'remote-plugin',
      'remote_meta',
      expect.objectContaining({
        repo: 'example/plugins',
        ref: 'main',
        path: 'remote-plugin',
        version: '1.2.3',
        installedAt: expect.any(Number)
      })
    )
    expect(pluginStore.getPlugins).toHaveBeenCalledOnce()
  })

  it('uses injected registry and local install ports when creating the default remote installer', async () => {
    const remotePlugin: RemotePluginCatalogItem = {
      pluginId: 'remote-plugin',
      name: 'Remote Plugin',
      version: '1.2.3',
      description: 'Remote plugin',
      manifest: 'remote-plugin/plugin.json',
      readme: 'remote-plugin/README.md',
      path: 'remote-plugin',
      entries: { main: 'dist/main.js' },
      capabilities: [{
        kind: 'request-adapter',
        providerType: 'openai',
        modelTypes: ['llm']
      }],
      repo: 'example/plugins',
      ref: 'main'
    }
    const plugins: PluginEntity[] = [{
      pluginId: 'remote-plugin',
      name: 'Remote Plugin',
      source: 'remote',
      enabled: true,
      version: '1.2.3',
      status: 'installed',
      capabilities: []
    }]
    const pluginStore = {
      getPluginConfigs: vi.fn(),
      savePluginConfigs: vi.fn(),
      getPlugins: vi.fn().mockReturnValue(plugins),
      updatePluginSource: vi.fn(),
      savePluginSetting: vi.fn()
    }
    const pluginManifestSyncService = {
      syncLocalPluginManifests: vi.fn().mockReturnValue(plugins)
    }
    const localPluginCatalogService = {
      scanInstalledPlugins: vi.fn().mockResolvedValue([{
        pluginId: 'remote-plugin',
        displayName: 'Remote Plugin',
        version: '1.2.3',
        manifestPath: '/tmp/remote-plugin/plugin.json',
        installRoot: '/tmp/remote-plugin',
        status: 'installed',
        capabilities: []
      }]),
      loadPluginManifestFromDirectory: vi.fn()
    }
    const localPluginInstallService = {
      importFromDirectory: vi.fn(),
      uninstall: vi.fn()
    }
    const remotePluginRegistryService = {
      listAvailablePlugins: vi.fn()
    }
    const installSpy = vi
      .spyOn(RemotePluginInstallService.prototype as RemotePluginInstallService, 'install')
      .mockImplementation(async function (this: any, pluginId: string) {
        expect(pluginId).toBe('remote-plugin')
        expect(this.registryService).toBe(remotePluginRegistryService)
        expect(this.localInstallService).toBe(localPluginInstallService)

        return {
          plugin: remotePlugin,
          installRoot: '/tmp/remote-plugin'
        }
      })

    const service = new PluginRuntimeService({
      pluginStore,
      pluginManifestSyncService,
      localPluginCatalogService,
      localPluginInstallService,
      remotePluginRegistryService
    })

    await expect(service.installRemotePlugin('remote-plugin')).resolves.toEqual(plugins)
    expect(pluginStore.updatePluginSource).toHaveBeenCalledWith('remote-plugin', 'remote')
    expect(pluginStore.savePluginSetting).toHaveBeenCalled()
    installSpy.mockRestore()
  })
})
