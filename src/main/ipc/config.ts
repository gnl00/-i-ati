import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { DB_CONFIG_GET, DB_CONFIG_INIT, DB_CONFIG_SAVE } from '@shared/constants'

export function registerConfigHandlers(): void {
  ipcMain.handle(DB_CONFIG_GET, async () => {
    console.log('[Database IPC] Get config')
    return DatabaseService.getConfig()
  })

  ipcMain.handle(DB_CONFIG_SAVE, async (_event, config) => {
    console.log('[Database IPC] Save config')
    return DatabaseService.saveConfig(config)
  })

  ipcMain.handle(DB_CONFIG_INIT, async () => {
    console.log('[Database IPC] Init config')
    return DatabaseService.initConfig()
  })
}
