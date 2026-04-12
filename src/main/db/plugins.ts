import DatabaseService from './DatabaseService'
import type { ScannedLocalPluginManifest } from '@main/services/plugins'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'

export const pluginDb = {
  getPluginConfigs(): AppPluginConfig[] {
    return DatabaseService.getPluginConfigs()
  },

  savePluginConfigs(configs: AppPluginConfig[]): void {
    DatabaseService.savePluginConfigs(configs)
  },

  getPlugins(): PluginEntity[] {
    return DatabaseService.getPlugins()
  },

  inspectLocalPluginDirectory(sourceDir: string): Promise<ScannedLocalPluginManifest> {
    return DatabaseService.inspectLocalPluginDirectory(sourceDir)
  },

  rescanLocalPlugins(): Promise<PluginEntity[]> {
    return DatabaseService.rescanLocalPlugins()
  },

  importLocalPluginFromDirectory(sourceDir: string): Promise<PluginEntity[]> {
    return DatabaseService.importLocalPluginFromDirectory(sourceDir)
  },

  uninstallLocalPlugin(pluginId: string): Promise<PluginEntity[]> {
    return DatabaseService.uninstallLocalPlugin(pluginId)
  },

  listRemotePlugins(): Promise<RemotePluginCatalogItem[]> {
    return DatabaseService.listRemotePlugins()
  },

  installRemotePlugin(pluginId: string): Promise<PluginEntity[]> {
    return DatabaseService.installRemotePlugin(pluginId)
  }
}
