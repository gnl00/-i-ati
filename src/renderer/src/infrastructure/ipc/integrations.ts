import {
  KNOWLEDGEBASE_CLEAR,
  KNOWLEDGEBASE_REINDEX,
  KNOWLEDGEBASE_SEARCH,
  KNOWLEDGEBASE_STATS,
  KNOWLEDGEBASE_STATUS,
  MCP_CONNECT,
  MCP_DISCONNECT,
  MCP_STATUS,
  MCP_TOOL_CALL,
  SKILL_DELETE_ACTION,
  SKILL_GET_ACTION,
  SKILL_IMPORT_ACTION,
  SKILL_LIST_ACTION,
  SKILL_REVEAL_ACTION,
  TELEGRAM_GATEWAY_START,
  TELEGRAM_GATEWAY_STATUS,
  TELEGRAM_GATEWAY_STOP,
  TELEGRAM_GATEWAY_TEST,
  WEB_FETCH_ACTION,
  WEB_SEARCH_ACTION
} from '@shared/constants/index'
import { invokeIpc } from './client'

export const invokeMcpConnect = (mcpProps: any): Promise<any> => invokeIpc(MCP_CONNECT, mcpProps)
export const invokeMcpDisconnect = (serverInfo: { name: string }): Promise<any> => invokeIpc(MCP_DISCONNECT, serverInfo)
export const invokeMcpToolCall = (toolCallInfo: any): Promise<any> => invokeIpc(MCP_TOOL_CALL, toolCallInfo)
export const invokeMcpStatus = (): Promise<McpRuntimeSnapshot> => invokeIpc(MCP_STATUS)
export const invokeWebSearchIPC = (args: { param: string; engine?: 'bing' | 'google'; fetchCounts?: number; snippetsOnly?: boolean }): Promise<any> =>
  invokeIpc(WEB_SEARCH_ACTION, args)
export const invokeWebFetchIPC = (args: { url: string; cleanMode?: 'lite' | 'full' }): Promise<any> =>
  invokeIpc(WEB_FETCH_ACTION, args)
export const invokeSkillList = (): Promise<SkillMetadata[]> => invokeIpc(SKILL_LIST_ACTION)
export const invokeSkillGetContent = (name: string): Promise<string> => invokeIpc(SKILL_GET_ACTION, { name })
export const invokeImportSkills = (folderPath: string): Promise<{
  installed: SkillMetadata[]
  renamed: Array<{ from: string; to: string }>
  skipped: Array<{ path: string; reason: string }>
  failed: Array<{ path: string; error: string }>
}> => invokeIpc(SKILL_IMPORT_ACTION, { folderPath })
export const invokeDeleteSkill = (name: string): Promise<void> => invokeIpc(SKILL_DELETE_ACTION, { name })
export const invokeRevealSkillInFolder = (name: string): Promise<{ success: boolean; error?: string }> =>
  invokeIpc(SKILL_REVEAL_ACTION, { name })

export interface TelegramGatewayStatus {
  running: boolean
  starting: boolean
  configured: boolean
  enabled: boolean
  mode?: 'polling' | 'webhook'
  hasMainModel: boolean
  lastUpdateId: number
  botUsername?: string
  botId?: string
  lastError?: string
  lastErrorAt?: number
  lastSuccessfulPollAt?: number
  lastMessageProcessedAt?: number
}

export const invokeTelegramGatewayStatus = (): Promise<TelegramGatewayStatus> => invokeIpc(TELEGRAM_GATEWAY_STATUS)
export const invokeTelegramGatewayTest = (botToken?: string): Promise<{ ok: boolean; username?: string; id?: string; error?: string }> =>
  invokeIpc(TELEGRAM_GATEWAY_TEST, { botToken })
export const invokeTelegramGatewayStart = (): Promise<TelegramGatewayStatus> => invokeIpc(TELEGRAM_GATEWAY_START)
export const invokeTelegramGatewayStop = (): Promise<TelegramGatewayStatus> => invokeIpc(TELEGRAM_GATEWAY_STOP)

export const invokeKnowledgebaseReindex = (args?: { force?: boolean; configOverride?: KnowledgebaseConfig }): Promise<{ success: boolean }> =>
  invokeIpc(KNOWLEDGEBASE_REINDEX, args ?? {})
export const invokeKnowledgebaseSearch = (args: {
  query: string
  localized_query: string
  top_k?: number
  threshold?: number
  folders?: string[]
  extensions?: string[]
}): Promise<{
  success: boolean
  query: string
  total_hits: number
  results: Array<{
    chunk_id: string
    document_id: string
    file_path: string
    file_name: string
    folder_path: string
    ext: string
    text: string
    chunk_index: number
    score: number
    similarity: number
    char_start: number
    char_end: number
    token_estimate: number
  }>
  message?: string
}> => invokeIpc(KNOWLEDGEBASE_SEARCH, args)
export const invokeKnowledgebaseStatus = (): Promise<{
  state: 'idle' | 'scanning' | 'chunking' | 'embedding' | 'completed' | 'failed'
  totalFiles: number
  processedFiles: number
  totalChunks: number
  processedChunks: number
  message?: string
  updatedAt: number
}> => invokeIpc(KNOWLEDGEBASE_STATUS)
export const invokeKnowledgebaseStats = (): Promise<{
  documentCount: number
  chunkCount: number
  indexedDocumentCount: number
  lastIndexedAt?: number
}> => invokeIpc(KNOWLEDGEBASE_STATS)
export const invokeKnowledgebaseClear = (): Promise<{ success: boolean }> => invokeIpc(KNOWLEDGEBASE_CLEAR)
