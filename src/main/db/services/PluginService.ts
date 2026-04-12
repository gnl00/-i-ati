import type { PluginRuntimeService } from '@main/services/plugins'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'

type PluginServiceDeps = {
  pluginRuntimeService: () => PluginRuntimeService | undefined
}

export class PluginService {
  constructor(private readonly deps: PluginServiceDeps) {}

  getPluginConfigs(): AppPluginConfig[] {
    return this.requirePluginRuntimeService().getPluginConfigs()
  }

  savePluginConfigs(configs: AppPluginConfig[]): void {
    this.requirePluginRuntimeService().savePluginConfigs(configs)
  }

  getPlugins(): PluginEntity[] {
    return this.requirePluginRuntimeService().getPlugins()
  }

  inspectLocalPluginDirectory(sourceDir: string): Promise<ScannedLocalPluginManifest> {
    return this.requirePluginRuntimeService().inspectLocalPluginDirectory(sourceDir)
  }

  rescanLocalPlugins(): Promise<PluginEntity[]> {
    return this.requirePluginRuntimeService().rescanLocalPlugins()
  }

  importLocalPluginFromDirectory(sourceDir: string): Promise<PluginEntity[]> {
    return this.requirePluginRuntimeService().importLocalPluginFromDirectory(sourceDir)
  }

  uninstallLocalPlugin(pluginId: string): Promise<PluginEntity[]> {
    return this.requirePluginRuntimeService().uninstallLocalPlugin(pluginId)
  }

  listRemotePlugins(): Promise<RemotePluginCatalogItem[]> {
    return this.requirePluginRuntimeService().listRemotePlugins()
  }

  installRemotePlugin(pluginId: string): Promise<PluginEntity[]> {
    return this.requirePluginRuntimeService().installRemotePlugin(pluginId)
  }

  private requirePluginRuntimeService(): PluginRuntimeService {
    const service = this.deps.pluginRuntimeService()
    if (!service) throw new Error('Plugin runtime not initialized')
    return service
  }
}
