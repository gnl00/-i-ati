import type { PluginRepository } from '@main/db/repositories/PluginRepository'
import type { PluginManifestSyncService } from '@main/db/services/PluginManifestSyncService'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import type { ScannedLocalPluginManifest } from './LocalPluginCatalogService'
import { LocalPluginCatalogService } from './LocalPluginCatalogService'
import { LocalPluginInstallService } from './LocalPluginInstallService'
import { RemotePluginInstallService } from './RemotePluginInstallService'
import { RemotePluginRegistryService } from './RemotePluginRegistryService'

type PluginStore = Pick<
  PluginRepository,
  'getPluginConfigs'
  | 'savePluginConfigs'
  | 'getPlugins'
  | 'updatePluginSource'
  | 'savePluginSetting'
>

type PluginManifestSyncPort = Pick<PluginManifestSyncService, 'syncLocalPluginManifests'>

type LocalPluginCatalogPort = Pick<LocalPluginCatalogService, 'scanInstalledPlugins' | 'loadPluginManifestFromDirectory'>
type LocalPluginInstallPort = Pick<LocalPluginInstallService, 'importFromDirectory' | 'uninstall'>
type RemotePluginRegistryPort = Pick<RemotePluginRegistryService, 'listAvailablePlugins'>
type RemotePluginInstallPort = Pick<RemotePluginInstallService, 'install'>

type PluginRuntimeServiceDeps = {
  pluginStore: PluginStore
  pluginManifestSyncService: PluginManifestSyncPort
  localPluginCatalogService?: LocalPluginCatalogPort
  localPluginInstallService?: LocalPluginInstallPort
  remotePluginRegistryService?: RemotePluginRegistryPort
  remotePluginInstallService?: RemotePluginInstallPort
}

export class PluginRuntimeService {
  private readonly localPluginCatalogService: LocalPluginCatalogPort
  private readonly localPluginInstallService: LocalPluginInstallPort
  private readonly remotePluginRegistryService: RemotePluginRegistryPort
  private readonly remotePluginInstallService: RemotePluginInstallPort

  constructor(private readonly deps: PluginRuntimeServiceDeps) {
    const defaultLocalPluginCatalogService = new LocalPluginCatalogService()
    const defaultLocalPluginInstallService = new LocalPluginInstallService(defaultLocalPluginCatalogService)
    const defaultRemotePluginRegistryService = new RemotePluginRegistryService()

    this.localPluginCatalogService = deps.localPluginCatalogService ?? defaultLocalPluginCatalogService
    this.localPluginInstallService = deps.localPluginInstallService ?? defaultLocalPluginInstallService
    this.remotePluginRegistryService = deps.remotePluginRegistryService ?? defaultRemotePluginRegistryService
    this.remotePluginInstallService = deps.remotePluginInstallService
      ?? new RemotePluginInstallService(this.remotePluginRegistryService, this.localPluginInstallService)
  }

  getPluginConfigs(): AppPluginConfig[] {
    return this.deps.pluginStore.getPluginConfigs()
  }

  savePluginConfigs(configs: AppPluginConfig[]): void {
    this.deps.pluginStore.savePluginConfigs(configs)
  }

  getPlugins(): PluginEntity[] {
    return this.deps.pluginStore.getPlugins()
  }

  async rescanLocalPlugins(): Promise<PluginEntity[]> {
    const manifests = await this.localPluginCatalogService.scanInstalledPlugins()
    return this.deps.pluginManifestSyncService.syncLocalPluginManifests(manifests)
  }

  async inspectLocalPluginDirectory(sourceDir: string): Promise<ScannedLocalPluginManifest> {
    return await this.localPluginCatalogService.loadPluginManifestFromDirectory(sourceDir)
  }

  async importLocalPluginFromDirectory(sourceDir: string): Promise<PluginEntity[]> {
    await this.localPluginInstallService.importFromDirectory(sourceDir)
    return await this.rescanLocalPlugins()
  }

  async uninstallLocalPlugin(pluginId: string): Promise<PluginEntity[]> {
    await this.localPluginInstallService.uninstall(pluginId)
    return await this.rescanLocalPlugins()
  }

  async listRemotePlugins(): Promise<RemotePluginCatalogItem[]> {
    return await this.remotePluginRegistryService.listAvailablePlugins()
  }

  async installRemotePlugin(pluginId: string): Promise<PluginEntity[]> {
    const result = await this.remotePluginInstallService.install(pluginId)
    await this.rescanLocalPlugins()
    this.deps.pluginStore.updatePluginSource(result.plugin.pluginId, 'remote')
    this.deps.pluginStore.savePluginSetting(result.plugin.pluginId, 'remote_meta', {
      repo: result.plugin.repo,
      ref: result.plugin.ref,
      path: result.plugin.path,
      version: result.plugin.version,
      installedAt: Date.now()
    })
    return this.deps.pluginStore.getPlugins()
  }
}
