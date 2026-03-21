import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { createLogger } from '@main/services/logging/LogService'
import { DB_PLUGINS_GET, DB_PLUGINS_IMPORT, DB_PLUGINS_REMOTE_INSTALL, DB_PLUGINS_REMOTE_LIST, DB_PLUGINS_RESCAN, DB_PLUGINS_SAVE, DB_PLUGINS_UNINSTALL } from '@shared/constants'

const logger = createLogger('DatabaseIPC')

export function registerPluginHandlers(): void {
  ipcMain.handle(DB_PLUGINS_GET, async () => {
    logger.info('plugins.get')
    return DatabaseService.getPlugins()
  })

  ipcMain.handle(DB_PLUGINS_REMOTE_LIST, async () => {
    logger.info('plugins.remote_list')
    return await DatabaseService.listRemotePlugins()
  })

  ipcMain.handle(DB_PLUGINS_REMOTE_INSTALL, async (_event, pluginId: string) => {
    logger.info('plugins.remote_install', { pluginId })
    return await DatabaseService.installRemotePlugin(pluginId)
  })

  ipcMain.handle(DB_PLUGINS_SAVE, async (_event, configs: AppPluginConfig[]) => {
    logger.info('plugins.save_configs', { count: configs.length })
    return DatabaseService.savePluginConfigs(configs)
  })

  ipcMain.handle(DB_PLUGINS_RESCAN, async () => {
    logger.info('plugins.rescan_local')
    return await DatabaseService.rescanLocalPlugins()
  })

  ipcMain.handle(DB_PLUGINS_IMPORT, async (_event, sourceDir: string) => {
    logger.info('plugins.import_local', { sourceDir })
    return await DatabaseService.importLocalPluginFromDirectory(sourceDir)
  })

  ipcMain.handle(DB_PLUGINS_UNINSTALL, async (_event, pluginId: string) => {
    logger.info('plugins.uninstall_local', { pluginId })
    return await DatabaseService.uninstallLocalPlugin(pluginId)
  })
}
