import { ipcMain } from 'electron'
import { telegramGatewayService } from '@main/services/telegram'
import { createLogger } from '@main/services/logging/LogService'
import {
  TELEGRAM_GATEWAY_START,
  TELEGRAM_GATEWAY_STATUS,
  TELEGRAM_GATEWAY_STOP,
  TELEGRAM_GATEWAY_TEST
} from '@shared/constants'

const logger = createLogger('TelegramIPC')

export function registerTelegramHandlers(): void {
  ipcMain.handle(TELEGRAM_GATEWAY_STATUS, async () => {
    logger.info('gateway.status')
    return telegramGatewayService.getStatus()
  })

  ipcMain.handle(TELEGRAM_GATEWAY_TEST, async (_event, args?: { botToken?: string }) => {
    logger.info('gateway.test')
    return await telegramGatewayService.testConnection(args?.botToken)
  })

  ipcMain.handle(TELEGRAM_GATEWAY_START, async () => {
    logger.info('gateway.start')
    await telegramGatewayService.start()
    return telegramGatewayService.getStatus()
  })

  ipcMain.handle(TELEGRAM_GATEWAY_STOP, async () => {
    logger.info('gateway.stop')
    telegramGatewayService.stop()
    return telegramGatewayService.getStatus()
  })
}
