import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import {
  ChatRunService,
  type MainChatRunInput,
  type ToolConfirmationDecision
} from '@main/services/chatRun'
import type {
  ChatCompressionExecuteInput,
  ChatTitleGenerateInput
} from '@main/services/chatOperations'
import {
  DB_CHAT_SAVE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_UPDATE,
  DB_CHAT_DELETE,
  DB_CHAT_SKILL_ADD,
  DB_CHAT_SKILL_REMOVE,
  DB_CHAT_SKILLS_GET,
  DB_ASSISTANT_SAVE,
  DB_ASSISTANT_GET_ALL,
  DB_ASSISTANT_GET_BY_ID,
  DB_ASSISTANT_UPDATE,
  DB_ASSISTANT_DELETE,
  CHAT_RUN_START,
  CHAT_RUN_CANCEL,
  CHAT_RUN_TOOL_CONFIRM,
  CHAT_COMPRESSION_EXECUTE,
  CHAT_TITLE_GENERATE
} from '@shared/constants'

const chatRunService = new ChatRunService()

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

  ipcMain.handle(CHAT_RUN_START, async (_event, data: MainChatRunInput) => {
    console.log(`[ChatSubmit IPC] Submit: ${data.submissionId}`)
    return chatRunService.start(data)
  })

  ipcMain.handle(CHAT_RUN_CANCEL, async (_event, data: { submissionId: string; reason?: string }) => {
    console.log(`[ChatSubmit IPC] Cancel: ${data.submissionId}`)
    chatRunService.cancel(data.submissionId)
    return { cancelled: true }
  })

  ipcMain.handle(CHAT_RUN_TOOL_CONFIRM, async (_event, data: { toolCallId: string; approved: boolean; reason?: string; args?: unknown }) => {
    const decision: ToolConfirmationDecision = {
      approved: data.approved,
      reason: data.reason,
      args: data.args
    }
    chatRunService.resolveToolConfirmation(data.toolCallId, decision)
    return { ok: true }
  })

  ipcMain.handle(CHAT_COMPRESSION_EXECUTE, async (_event, data: ChatCompressionExecuteInput) => {
    console.log('[Compression IPC] Execute')
    return await chatRunService.executeCompression(data)
  })

  ipcMain.handle(CHAT_TITLE_GENERATE, async (_event, data: ChatTitleGenerateInput) => {
    console.log('[Title IPC] Generate title')
    return await chatRunService.generateTitle(data)
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
