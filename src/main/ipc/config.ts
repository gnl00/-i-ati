import { ipcMain } from 'electron'
import { SkillService } from '@main/services/skills/SkillService'
import { configDb } from '@main/db/config'
import { createLogger } from '@main/logging/LogService'
import { DB_CONFIG_GET, DB_CONFIG_INIT, DB_CONFIG_SAVE } from '@shared/constants'

const logger = createLogger('DatabaseIPC')

export function registerConfigHandlers(): void {
  ipcMain.handle(DB_CONFIG_GET, async () => {
    logger.info('config.get')
    return configDb.getConfig()
  })

  ipcMain.handle(DB_CONFIG_SAVE, async (_event, config) => {
    logger.info('config.save')
    const previousFolders = configDb.getConfig()?.skills?.folders ?? []
    const result = configDb.saveConfig(config)
    if (JSON.stringify(previousFolders) !== JSON.stringify(config.skills?.folders ?? [])) {
      await SkillService.initializeFromConfig(config)
    }
    return result
  })

  ipcMain.handle(DB_CONFIG_INIT, async () => {
    logger.info('config.init')
    return configDb.initConfig()
  })
}
