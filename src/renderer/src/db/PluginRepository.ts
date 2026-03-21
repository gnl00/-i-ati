import {
  invokeDbPluginsGet,
  invokeDbPluginsRemoteInstall,
  invokeDbPluginsRemoteList,
  invokeDbPluginsImport,
  invokeDbPluginsRescan,
  invokeDbPluginsSave,
  invokeDbPluginsUninstall
} from '@renderer/invoker/ipcInvoker'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'

const getPlugins = async (): Promise<PluginEntity[]> => {
  return await invokeDbPluginsGet()
}

const getRemotePlugins = async (): Promise<RemotePluginCatalogItem[]> => {
  return await invokeDbPluginsRemoteList()
}

const installRemotePlugin = async (pluginId: string): Promise<PluginEntity[]> => {
  return await invokeDbPluginsRemoteInstall(pluginId)
}

const savePluginConfigs = async (configs: AppPluginConfig[]): Promise<void> => {
  return await invokeDbPluginsSave(configs)
}

const rescanLocalPlugins = async (): Promise<PluginEntity[]> => {
  return await invokeDbPluginsRescan()
}

const importLocalPlugin = async (sourceDir: string): Promise<PluginEntity[]> => {
  return await invokeDbPluginsImport(sourceDir)
}

const uninstallLocalPlugin = async (pluginId: string): Promise<PluginEntity[]> => {
  return await invokeDbPluginsUninstall(pluginId)
}

export {
  getPlugins,
  getRemotePlugins,
  installRemotePlugin,
  importLocalPlugin,
  rescanLocalPlugins,
  savePluginConfigs,
  uninstallLocalPlugin
}
