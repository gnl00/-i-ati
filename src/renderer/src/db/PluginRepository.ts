import {
  invokeDbPluginsGet,
  invokeDbPluginsImport,
  invokeDbPluginsRescan,
  invokeDbPluginsSave,
  invokeDbPluginsUninstall
} from '@renderer/invoker/ipcInvoker'

const getPlugins = async (): Promise<PluginEntity[]> => {
  return await invokeDbPluginsGet()
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
  importLocalPlugin,
  rescanLocalPlugins,
  savePluginConfigs,
  uninstallLocalPlugin
}
