import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { DB_PLUGINS_GET, DB_PLUGINS_IMPORT, DB_PLUGINS_RESCAN, DB_PLUGINS_SAVE, DB_PLUGINS_UNINSTALL } from '@shared/constants'

export function registerPluginHandlers(): void {
  ipcMain.handle(DB_PLUGINS_GET, async () => {
    console.log('[Database IPC] Get plugins')
    return DatabaseService.getPlugins()
  })

  ipcMain.handle(DB_PLUGINS_SAVE, async (_event, configs: AppPluginConfig[]) => {
    console.log('[Database IPC] Save plugin configs')
    return DatabaseService.savePluginConfigs(configs)
  })

  ipcMain.handle(DB_PLUGINS_RESCAN, async () => {
    console.log('[Database IPC] Rescan local plugins')
    return await DatabaseService.rescanLocalPlugins()
  })

  ipcMain.handle(DB_PLUGINS_IMPORT, async (_event, sourceDir: string) => {
    console.log('[Database IPC] Import local plugin from directory')
    return await DatabaseService.importLocalPluginFromDirectory(sourceDir)
  })

  ipcMain.handle(DB_PLUGINS_UNINSTALL, async (_event, pluginId: string) => {
    console.log('[Database IPC] Uninstall local plugin')
    return await DatabaseService.uninstallLocalPlugin(pluginId)
  })
}
