import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID } from '@shared/constants'

export function registerScheduledTaskHandlers(): void {
  ipcMain.handle(DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID, async (_event, chatUuid: string) => {
    console.log(`[Database IPC] Get scheduled tasks by chat uuid: ${chatUuid}`)
    return DatabaseService.getScheduledTasksByChatUuid(chatUuid)
  })
}
