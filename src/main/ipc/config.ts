import { ipcMain } from 'electron'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import { DB_CONFIG_GET, DB_CONFIG_INIT, DB_CONFIG_SAVE } from '@shared/constants'

const logger = createLogger('DatabaseIPC')

export function registerConfigHandlers(): void {
  ipcMain.handle(DB_CONFIG_GET, async () => {
    logger.info('config.get')
    return DatabaseService.getConfig()
  })

  ipcMain.handle(DB_CONFIG_SAVE, async (_event, config) => {
    logger.info('config.save')
    return DatabaseService.saveConfig(config)
  })

  ipcMain.handle(DB_CONFIG_INIT, async () => {
    logger.info('config.init')
    return DatabaseService.initConfig()
  })
}
