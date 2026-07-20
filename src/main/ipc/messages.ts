import { ipcMain } from 'electron'
import { chatDb } from '@main/db/chat'
import { createLogger } from '@main/logging/LogService'
import { resolvePersistedToolResultMessages } from '@main/orchestration/chat/toolResultCompaction'
import {
  DB_MESSAGE_SAVE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_GET_BY_CHAT_ID,
  DB_MESSAGE_GET_BY_CHAT_UUID,
  DB_MESSAGE_UPDATE,
  DB_MESSAGE_PATCH_UI_STATE,
  DB_MESSAGE_DELETE
} from '@shared/constants'

const logger = createLogger('DatabaseIPC')

export function registerMessageHandlers(): void {
  ipcMain.handle(DB_MESSAGE_SAVE, async (_event, data) => {
    logger.info('message.save')
    return chatDb.saveMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_GET_ALL, async (_event) => {
    logger.info('message.get_all')
    return resolvePersistedToolResultMessages(chatDb.getAllMessages(), chatDb)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_ID, async (_event, id) => {
    logger.info('message.get_by_id', { id })
    const message = chatDb.getMessageById(id)
    return message
      ? resolvePersistedToolResultMessages([message], chatDb)[0]
      : undefined
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_IDS, async (_event, ids) => {
    logger.info('message.get_by_ids', { count: ids?.length ?? 0 })
    return resolvePersistedToolResultMessages(chatDb.getMessageByIds(ids), chatDb)
  })

  const handleMessageGetByChatId = async (_event: Electron.IpcMainInvokeEvent, chatId: number) => {
    logger.info('message.get_by_chat_id', { chatId })
    return resolvePersistedToolResultMessages(chatDb.getMessagesByChatId(chatId), chatDb)
  }

  const handleMessageGetByChatUuid = async (
    _event: Electron.IpcMainInvokeEvent,
    chatUuid: string
  ) => {
    logger.info('message.get_by_chat_uuid', { chatUuid })
    return resolvePersistedToolResultMessages(chatDb.getMessagesByChatUuid(chatUuid), chatDb)
  }

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_ID, handleMessageGetByChatId)

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_UUID, handleMessageGetByChatUuid)

  ipcMain.handle(DB_MESSAGE_UPDATE, async (_event, data) => {
    logger.info('message.update', { id: data.id })
    return chatDb.updateMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_PATCH_UI_STATE, async (_event, data: {
    id: number
    uiState: MessageUiStatePatch
  }) => {
    logger.info('message.patch_ui_state', {
      id: data.id,
      typewriterCompleted: data.uiState?.typewriterCompleted
    })
    return chatDb.patchMessageUiState(data.id, data.uiState)
  })

  ipcMain.handle(DB_MESSAGE_DELETE, async (_event, id) => {
    logger.info('message.delete', { id })
    return chatDb.deleteMessage(id)
  })

  ipcMain.handle('db:compressed-summary:save', async (_event, data: CompressedSummaryEntity) => {
    logger.info('compressed_summary.save', { id: data.id })
    return chatDb.saveCompressedSummary(data)
  })

  ipcMain.handle('db:compressed-summary:get-by-chat-id', async (_event, chatId: number) => {
    logger.info('compressed_summary.get_by_chat_id', { chatId })
    return chatDb.getCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:get-active-by-chat-id', async (_event, chatId: number) => {
    logger.info('compressed_summary.get_active_by_chat_id', { chatId })
    return chatDb.getActiveCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:update-status', async (_event, id: number, status: string) => {
    logger.info('compressed_summary.update_status', { id, status })
    return chatDb.updateCompressedSummaryStatus(id, status as 'active' | 'superseded' | 'invalid')
  })

  ipcMain.handle('db:compressed-summary:delete', async (_event, id: number) => {
    logger.info('compressed_summary.delete', { id })
    return chatDb.deleteCompressedSummary(id)
  })
}
