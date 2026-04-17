import { ipcMain } from 'electron'
import DatabaseService from '@main/db/DatabaseService'
import { createLogger } from '@main/logging/LogService'
import {
  RunService,
  type MainAgentRunInput,
  type ToolConfirmationDecision
} from '@main/orchestration/chat/run'
import type {
  CompressionExecutionInput,
  TitleGenerationInput
} from '@main/orchestration/chat/maintenance'
import {
  DB_CHAT_SAVE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_SEARCH,
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
  RUN_START,
  RUN_CANCEL,
  RUN_TOOL_CONFIRM,
  RUN_COMPRESSION_EXECUTE,
  RUN_TITLE_GENERATE
} from '@shared/constants'

const runService = new RunService()
const logger = createLogger('DatabaseIPC')
const LEGACY_RUN_START = 'chat-run:start'
const LEGACY_RUN_CANCEL = 'chat-run:cancel'
const LEGACY_RUN_TOOL_CONFIRM = 'chat-run:tool-confirm'
const LEGACY_RUN_COMPRESSION_EXECUTE = 'chat-compression:execute'
const LEGACY_RUN_TITLE_GENERATE = 'chat-title:generate'

export function registerChatHandlers(): void {
  const handleRunStart = async (_event: Electron.IpcMainInvokeEvent, data: MainAgentRunInput) => {
    console.log(`[ChatSubmit IPC] Submit: ${data.submissionId}`)
    return runService.start(data)
  }

  const handleRunCancel = async (
    _event: Electron.IpcMainInvokeEvent,
    data: { submissionId: string; reason?: string }
  ) => {
    console.log(`[ChatSubmit IPC] Cancel: ${data.submissionId}`)
    runService.cancel(data.submissionId)
    return { cancelled: true }
  }

  const handleRunToolConfirm = async (
    _event: Electron.IpcMainInvokeEvent,
    data: { toolCallId: string; approved: boolean; reason?: string; args?: unknown }
  ) => {
    const decision: ToolConfirmationDecision = {
      approved: data.approved,
      reason: data.reason,
      args: data.args
    }
    runService.resolveToolConfirmation(data.toolCallId, decision)
    return { ok: true }
  }

  ipcMain.handle(DB_CHAT_SAVE, async (_event, data) => {
    logger.info('chat.save')
    return DatabaseService.saveChat(data)
  })

  ipcMain.handle(DB_CHAT_GET_ALL, async (_event) => {
    logger.info('chat.get_all')
    return DatabaseService.getAllChats()
  })

  ipcMain.handle(DB_CHAT_GET_BY_ID, async (_event, id) => {
    logger.info('chat.get_by_id', { id })
    return DatabaseService.getChatById(id)
  })

  ipcMain.handle(DB_CHAT_SEARCH, async (_event, args: ChatSearchRequest) => {
    logger.info('chat.search', {
      queryLength: args?.query?.trim().length ?? 0,
      limit: args?.limit
    })
    return DatabaseService.searchChats(args)
  })

  ipcMain.handle(DB_CHAT_UPDATE, async (_event, data) => {
    logger.info('chat.update', { id: data.id })
    return DatabaseService.updateChat(data)
  })

  ipcMain.handle(DB_CHAT_DELETE, async (_event, id) => {
    logger.info('chat.delete', { id })
    return DatabaseService.deleteChat(id)
  })

  ipcMain.handle(DB_CHAT_SKILL_ADD, async (_event, { chatId, skillName }) => {
    logger.info('chat_skill.add', { chatId, skillName })
    return DatabaseService.addSkill(chatId, skillName)
  })

  ipcMain.handle(DB_CHAT_SKILL_REMOVE, async (_event, { chatId, skillName }) => {
    logger.info('chat_skill.remove', { chatId, skillName })
    return DatabaseService.removeSkill(chatId, skillName)
  })

  ipcMain.handle(DB_CHAT_SKILLS_GET, async (_event, chatId) => {
    logger.info('chat_skill.get', { chatId })
    return DatabaseService.getSkills(chatId)
  })

  ipcMain.handle(RUN_START, handleRunStart)
  ipcMain.handle(LEGACY_RUN_START, handleRunStart)

  ipcMain.handle(RUN_CANCEL, handleRunCancel)
  ipcMain.handle(LEGACY_RUN_CANCEL, handleRunCancel)

  ipcMain.handle(RUN_TOOL_CONFIRM, handleRunToolConfirm)
  ipcMain.handle(LEGACY_RUN_TOOL_CONFIRM, handleRunToolConfirm)

  ipcMain.handle(RUN_COMPRESSION_EXECUTE, async (_event, data: CompressionExecutionInput) => {
    console.log('[Compression IPC] Execute')
    return await runService.executeCompression(data)
  })
  ipcMain.handle(LEGACY_RUN_COMPRESSION_EXECUTE, async (_event, data: CompressionExecutionInput) => {
    console.log('[Compression IPC] Execute')
    return await runService.executeCompression(data)
  })

  ipcMain.handle(RUN_TITLE_GENERATE, async (_event, data: TitleGenerationInput) => {
    console.log('[Title IPC] Generate title')
    return await runService.generateTitle(data)
  })
  ipcMain.handle(LEGACY_RUN_TITLE_GENERATE, async (_event, data: TitleGenerationInput) => {
    console.log('[Title IPC] Generate title')
    return await runService.generateTitle(data)
  })

  ipcMain.handle(DB_ASSISTANT_SAVE, async (_event, data: Assistant) => {
    logger.info('assistant.save', { id: data.id, name: data.name })
    return DatabaseService.saveAssistant(data)
  })

  ipcMain.handle(DB_ASSISTANT_GET_ALL, async (_event) => {
    logger.info('assistant.get_all')
    return DatabaseService.getAllAssistants()
  })

  ipcMain.handle(DB_ASSISTANT_GET_BY_ID, async (_event, id: string) => {
    logger.info('assistant.get_by_id', { id })
    return DatabaseService.getAssistantById(id)
  })

  ipcMain.handle(DB_ASSISTANT_UPDATE, async (_event, data: Assistant) => {
    logger.info('assistant.update', { id: data.id, name: data.name })
    return DatabaseService.updateAssistant(data)
  })

  ipcMain.handle(DB_ASSISTANT_DELETE, async (_event, id: string) => {
    logger.info('assistant.delete', { id })
    return DatabaseService.deleteAssistant(id)
  })
}
