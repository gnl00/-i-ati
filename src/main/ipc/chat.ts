import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { compressionService, type CompressionJob } from '@main/services/CompressionService'
import { generateTitle } from '@main/services/TitleService'
import { ChatSubmitEventEmitter } from '@main/services/chatSubmit/event-emitter'
import { MainChatSubmitService } from '@main/services/chatSubmit'
import {
  DB_CHAT_SAVE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_UPDATE,
  DB_CHAT_DELETE,
  DB_CHAT_SKILL_ADD,
  DB_CHAT_SKILL_REMOVE,
  DB_CHAT_SKILLS_GET,
  DB_CHAT_SUBMIT_EVENT_SAVE,
  DB_ASSISTANT_SAVE,
  DB_ASSISTANT_GET_ALL,
  DB_ASSISTANT_GET_BY_ID,
  DB_ASSISTANT_UPDATE,
  DB_ASSISTANT_DELETE,
  CHAT_SUBMIT_SUBMIT,
  CHAT_SUBMIT_CANCEL,
  CHAT_COMPRESSION_EXECUTE,
  CHAT_TITLE_GENERATE
} from '@shared/constants'

const chatSubmitService = new MainChatSubmitService()

function serializeError(error: any): { name: string; message: string; stack?: string } {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    stack: error?.stack
  }
}

export function registerChatHandlers(): void {
  ipcMain.handle(DB_CHAT_SAVE, async (_event, data) => {
    console.log('[Database IPC] Save chat')
    return DatabaseService.saveChat(data)
  })

  ipcMain.handle(DB_CHAT_GET_ALL, async (_event) => {
    console.log('[Database IPC] Get all chats')
    return DatabaseService.getAllChats()
  })

  ipcMain.handle(DB_CHAT_GET_BY_ID, async (_event, id) => {
    console.log(`[Database IPC] Get chat by id: ${id}`)
    return DatabaseService.getChatById(id)
  })

  ipcMain.handle(DB_CHAT_UPDATE, async (_event, data) => {
    console.log(`[Database IPC] Update chat: ${data.id}`)
    return DatabaseService.updateChat(data)
  })

  ipcMain.handle(DB_CHAT_DELETE, async (_event, id) => {
    console.log(`[Database IPC] Delete chat: ${id}`)
    return DatabaseService.deleteChat(id)
  })

  ipcMain.handle(DB_CHAT_SKILL_ADD, async (_event, { chatId, skillName }) => {
    console.log(`[Database IPC] Add chat skill: ${skillName}`)
    return DatabaseService.addChatSkill(chatId, skillName)
  })

  ipcMain.handle(DB_CHAT_SKILL_REMOVE, async (_event, { chatId, skillName }) => {
    console.log(`[Database IPC] Remove chat skill: ${skillName}`)
    return DatabaseService.removeChatSkill(chatId, skillName)
  })

  ipcMain.handle(DB_CHAT_SKILLS_GET, async (_event, chatId) => {
    console.log(`[Database IPC] Get chat skills: ${chatId}`)
    return DatabaseService.getChatSkills(chatId)
  })

  ipcMain.handle(CHAT_SUBMIT_SUBMIT, async (_event, data: {
    submissionId: string
    input: string
    modelRef: ModelRef
    chatId?: number
    chatUuid?: string
    options?: IUnifiedRequest['options']
    stream?: boolean
  }) => {
    console.log(`[ChatSubmit IPC] Submit: ${data.submissionId}`)
    return chatSubmitService.submit(data)
  })

  ipcMain.handle(CHAT_SUBMIT_CANCEL, async (_event, data: { submissionId: string; reason?: string }) => {
    console.log(`[ChatSubmit IPC] Cancel: ${data.submissionId}`)
    chatSubmitService.cancel(data.submissionId, data.reason)
    return { cancelled: true }
  })

  ipcMain.handle(CHAT_COMPRESSION_EXECUTE, async (_event, data: CompressionJob & { submissionId?: string }) => {
    console.log('[Compression IPC] Execute')
    const emitter = data.submissionId ? new ChatSubmitEventEmitter({
      submissionId: data.submissionId,
      chatId: data.chatId,
      chatUuid: data.chatUuid
    }) : null

    emitter?.emit('compression.started', {
      chatId: data.chatId,
      chatUuid: data.chatUuid,
      messageCount: data.messages?.length || 0
    })

    try {
      const result = await compressionService.execute(data)
      if (result.ok) {
        emitter?.emit('compression.completed', { result })
      } else {
        emitter?.emit('compression.failed', {
          error: {
            name: 'CompressionError',
            message: result.error || 'Compression failed'
          },
          result
        })
      }
      return result
    } catch (error) {
      emitter?.emit('compression.failed', { error: serializeError(error) })
      throw error
    }
  })

  ipcMain.handle(CHAT_TITLE_GENERATE, async (_event, data: {
    submissionId?: string
    chatId?: number
    chatUuid?: string
    content: string
    model: AccountModel
    account: ProviderAccount
    providerDefinition: ProviderDefinition
  }) => {
    console.log('[Title IPC] Generate title')
    const emitter = data.submissionId
      ? new ChatSubmitEventEmitter({
          submissionId: data.submissionId,
          chatId: data.chatId,
          chatUuid: data.chatUuid
        })
      : null

    emitter?.emit('title.generate.started', {
      model: data.model,
      contentLength: data.content?.length || 0
    })

    try {
      const title = await generateTitle(
        data.content,
        data.model,
        data.account,
        data.providerDefinition
      )
      emitter?.emit('title.generate.completed', { title })
      return { title }
    } catch (error) {
      emitter?.emit('title.generate.failed', { error: serializeError(error) })
      throw error
    }
  })

  ipcMain.handle(DB_CHAT_SUBMIT_EVENT_SAVE, async (_event, data: ChatSubmitEventTrace) => {
    console.log('[Database IPC] Save chat submit event')
    return DatabaseService.saveChatSubmitEvent(data)
  })

  ipcMain.handle(DB_ASSISTANT_SAVE, async (_event, data: Assistant) => {
    console.log(`[Database IPC] Save assistant: ${data.name}`)
    return DatabaseService.saveAssistant(data)
  })

  ipcMain.handle(DB_ASSISTANT_GET_ALL, async (_event) => {
    console.log('[Database IPC] Get all assistants')
    return DatabaseService.getAllAssistants()
  })

  ipcMain.handle(DB_ASSISTANT_GET_BY_ID, async (_event, id: string) => {
    console.log(`[Database IPC] Get assistant by id: ${id}`)
    return DatabaseService.getAssistantById(id)
  })

  ipcMain.handle(DB_ASSISTANT_UPDATE, async (_event, data: Assistant) => {
    console.log(`[Database IPC] Update assistant: ${data.id}`)
    return DatabaseService.updateAssistant(data)
  })

  ipcMain.handle(DB_ASSISTANT_DELETE, async (_event, id: string) => {
    console.log(`[Database IPC] Delete assistant: ${id}`)
    return DatabaseService.deleteAssistant(id)
  })
}
