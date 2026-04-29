import { ipcMain } from 'electron'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import { smartMessageGenerationService } from '@main/services/smartMessages'
import {
  DB_SMART_MESSAGE_DISMISS,
  DB_SMART_MESSAGES_GET_ACTIVE,
  DB_SMART_MESSAGES_REFRESH
} from '@shared/constants'

const logger = createLogger('SmartMessageIPC')

export function registerSmartMessageHandlers(): void {
  ipcMain.handle(DB_SMART_MESSAGES_GET_ACTIVE, async (_event, limit?: number) => {
    logger.info('smart_messages.get_active', { limit })
    return DatabaseService.getActiveSmartMessages(limit)
  })

  ipcMain.handle(DB_SMART_MESSAGE_DISMISS, async (_event, id: string) => {
    logger.info('smart_message.dismiss', { id })
    return DatabaseService.dismissSmartMessage(id)
  })

  ipcMain.handle(DB_SMART_MESSAGES_REFRESH, async () => {
    logger.info('smart_messages.refresh')
    return await smartMessageGenerationService.generate()
  })
}
