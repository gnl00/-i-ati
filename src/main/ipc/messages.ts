import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import {
  DB_MESSAGE_SAVE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_GET_BY_CHAT_ID,
  DB_MESSAGE_GET_BY_CHAT_UUID,
  DB_MESSAGE_UPDATE,
  DB_MESSAGE_DELETE
} from '@shared/constants'

export function registerMessageHandlers(): void {
  ipcMain.handle(DB_MESSAGE_SAVE, async (_event, data) => {
    console.log('[Database IPC] Save message')
    return DatabaseService.saveMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_GET_ALL, async (_event) => {
    console.log('[Database IPC] Get all messages')
    return DatabaseService.getAllMessages()
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_ID, async (_event, id) => {
    console.log(`[Database IPC] Get message by id: ${id}`)
    return DatabaseService.getMessageById(id)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_IDS, async (_event, ids) => {
    console.log(`[Database IPC] Get messages by ids: ${ids?.length ?? 0}`)
    return DatabaseService.getMessageByIds(ids)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_ID, async (_event, chatId) => {
    console.log(`[Database IPC] Get messages by chat id: ${chatId}`)
    return DatabaseService.getMessagesByChatId(chatId)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_UUID, async (_event, chatUuid) => {
    console.log(`[Database IPC] Get messages by chat uuid: ${chatUuid}`)
    return DatabaseService.getMessagesByChatUuid(chatUuid)
  })

  ipcMain.handle(DB_MESSAGE_UPDATE, async (_event, data) => {
    console.log(`[Database IPC] Update message: ${data.id}`)
    return DatabaseService.updateMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_DELETE, async (_event, id) => {
    console.log(`[Database IPC] Delete message: ${id}`)
    return DatabaseService.deleteMessage(id)
  })

  ipcMain.handle('db:compressed-summary:save', async (_event, data: CompressedSummaryEntity) => {
    console.log('[Database IPC] Save compressed summary')
    return DatabaseService.saveCompressedSummary(data)
  })

  ipcMain.handle('db:compressed-summary:get-by-chat-id', async (_event, chatId: number) => {
    console.log('[Database IPC] Get compressed summaries by chat id')
    return DatabaseService.getCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:get-active-by-chat-id', async (_event, chatId: number) => {
    console.log('[Database IPC] Get active compressed summaries by chat id')
    return DatabaseService.getActiveCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:update-status', async (_event, id: number, status: string) => {
    console.log('[Database IPC] Update compressed summary status')
    return DatabaseService.updateCompressedSummaryStatus(id, status as 'active' | 'superseded' | 'invalid')
  })

  ipcMain.handle('db:compressed-summary:delete', async (_event, id: number) => {
    console.log('[Database IPC] Delete compressed summary')
    return DatabaseService.deleteCompressedSummary(id)
  })
}
