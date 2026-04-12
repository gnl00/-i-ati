import { ipcMain } from 'electron'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
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
    return DatabaseService.saveMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_GET_ALL, async (_event) => {
    logger.info('message.get_all')
    return DatabaseService.getAllMessages()
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_ID, async (_event, id) => {
    logger.info('message.get_by_id', { id })
    return DatabaseService.getMessageById(id)
  })

  ipcMain.handle(DB_MESSAGE_GET_BY_IDS, async (_event, ids) => {
    logger.info('message.get_by_ids', { count: ids?.length ?? 0 })
    return DatabaseService.getMessageByIds(ids)
  })

  const handleMessageGetByChatId = async (_event: Electron.IpcMainInvokeEvent, chatId: number) => {
    logger.info('message.get_by_chat_id', { chatId })
    return DatabaseService.getMessagesByChatId(chatId)
  }

  const handleMessageGetByChatUuid = async (
    _event: Electron.IpcMainInvokeEvent,
    chatUuid: string
  ) => {
    logger.info('message.get_by_chat_uuid', { chatUuid })
    return DatabaseService.getMessagesByChatUuid(chatUuid)
  }

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_ID, handleMessageGetByChatId)

  ipcMain.handle(DB_MESSAGE_GET_BY_CHAT_UUID, handleMessageGetByChatUuid)

  ipcMain.handle(DB_MESSAGE_UPDATE, async (_event, data) => {
    logger.info('message.update', { id: data.id })
    return DatabaseService.updateMessage(data)
  })

  ipcMain.handle(DB_MESSAGE_PATCH_UI_STATE, async (_event, data: {
    id: number
    uiState: { typewriterCompleted?: boolean }
  }) => {
    logger.info('message.patch_ui_state', {
      id: data.id,
      typewriterCompleted: data.uiState?.typewriterCompleted
    })
    return DatabaseService.patchMessageUiState(data.id, data.uiState)
  })

  ipcMain.handle(DB_MESSAGE_DELETE, async (_event, id) => {
    logger.info('message.delete', { id })
    return DatabaseService.deleteMessage(id)
  })

  ipcMain.handle('db:compressed-summary:save', async (_event, data: CompressedSummaryEntity) => {
    logger.info('compressed_summary.save', { id: data.id })
    return DatabaseService.saveCompressedSummary(data)
  })

  ipcMain.handle('db:compressed-summary:get-by-chat-id', async (_event, chatId: number) => {
    logger.info('compressed_summary.get_by_chat_id', { chatId })
    return DatabaseService.getCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:get-active-by-chat-id', async (_event, chatId: number) => {
    logger.info('compressed_summary.get_active_by_chat_id', { chatId })
    return DatabaseService.getActiveCompressedSummariesByChatId(chatId)
  })

  ipcMain.handle('db:compressed-summary:update-status', async (_event, id: number, status: string) => {
    logger.info('compressed_summary.update_status', { id, status })
    return DatabaseService.updateCompressedSummaryStatus(id, status as 'active' | 'superseded' | 'invalid')
  })

  ipcMain.handle('db:compressed-summary:delete', async (_event, id: number) => {
    logger.info('compressed_summary.delete', { id })
    return DatabaseService.deleteCompressedSummary(id)
  })
}
