import { ipcMain } from 'electron'
import { LOG_WRITE } from '@shared/constants'
import type { LogWritePayload } from '@shared/types/logging'
import { logService } from '@main/services/logging/LogService'

export function registerLoggingHandlers(): void {
  ipcMain.on(LOG_WRITE, (_event, payload: LogWritePayload) => {
    logService.writeFromRenderer(payload)
  })
}
