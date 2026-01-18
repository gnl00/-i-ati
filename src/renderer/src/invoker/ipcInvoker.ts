/**
 * IPC Invoker
 * 统一管理所有 Renderer 进程到 Main 进程的 IPC 调用
 */

import {
  PIN_WINDOW,
  OPEN_EXTERNAL,
  WEB_SEARCH_ACTION,
  WEB_FETCH_ACTION,
  WIN_CLOSE,
  WIN_MINIMIZE,
  WIN_MAXIMIZE,
  MCP_CONNECT,
  MCP_DISCONNECT,
  MCP_TOOL_CALL,
  FILE_CREATE_DIR_ACTION,
  DB_CHAT_SAVE,
  DB_CHAT_GET_ALL,
  DB_CHAT_GET_BY_ID,
  DB_CHAT_UPDATE,
  DB_CHAT_DELETE,
  DB_MESSAGE_SAVE,
  DB_MESSAGE_GET_ALL,
  DB_MESSAGE_GET_BY_ID,
  DB_MESSAGE_GET_BY_IDS,
  DB_MESSAGE_UPDATE,
  DB_MESSAGE_DELETE,
  DB_CONFIG_GET,
  DB_CONFIG_SAVE,
  DB_CONFIG_INIT,
  DB_CHAT_SUBMIT_EVENT_SAVE,
  CHAT_SUBMIT_SUBMIT,
  CHAT_SUBMIT_CANCEL,
  CHAT_SUBMIT_EVENT,
  CHAT_COMPRESSION_EXECUTE,
  CHAT_TITLE_GENERATE
} from '@constants/index'

/**
 * 获取 Electron IPC Renderer
 */
function getElectronIPC() {
  const electron = (window as any).electron
  if (!electron?.ipcRenderer) {
    throw new Error('Electron IPC not available')
  }
  return electron.ipcRenderer
}

// ============ Window Operations ============

/**
 * 固定/取消固定窗口
 */
export async function invokePinWindow(pinState: boolean): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(PIN_WINDOW, pinState)
}

/**
 * 关闭窗口
 */
export async function invokeWindowClose(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_CLOSE)
}

/**
 * 最小化窗口
 */
export async function invokeWindowMinimize(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_MINIMIZE)
}

/**
 * 最大化窗口
 */
export async function invokeWindowMaximize(): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WIN_MAXIMIZE)
}

/**
 * 在外部浏览器打开 URL
 */
export async function invokeOpenExternal(url: string): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(OPEN_EXTERNAL, url)
}

// ============ MCP Operations ============

/**
 * 连接 MCP 服务器
 */
export async function invokeMcpConnect(mcpProps: any): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_CONNECT, mcpProps)
}

/**
 * 断开 MCP 服务器连接
 */
export async function invokeMcpDisconnect(serverInfo: { name: string }): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_DISCONNECT, serverInfo)
}

/**
 * 调用 MCP 工具
 */
export async function invokeMcpToolCall(toolCallInfo: any): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(MCP_TOOL_CALL, toolCallInfo)
}

// ============ Web Search Operations ============

/**
 * 执行 Web 搜索
 */
export async function invokeWebSearchIPC(args: { param: string; fetchCounts?: number; snippetsOnly?: boolean }): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WEB_SEARCH_ACTION, args)
}

/**
 * 执行 Web Fetch（获取指定 URL 的页面内容）
 */
export async function invokeWebFetchIPC(args: { url: string }): Promise<any> {
  const ipc = getElectronIPC()
  return await ipc.invoke(WEB_FETCH_ACTION, args)
}

// ============ File Operations ============

/**
 * 创建目录
 */
export async function invokeCreateDirectory(args: { directory_path: string; recursive?: boolean }): Promise<{ success: boolean; error?: string }> {
  const ipc = getElectronIPC()
  return await ipc.invoke(FILE_CREATE_DIR_ACTION, args)
}

// ============ Database Operations - Chat ============

/**
 * 保存聊天
 */
export async function invokeDbChatSave(data: ChatEntity): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_SAVE, data)
}

/**
 * 获取所有聊天
 */
export async function invokeDbChatGetAll(): Promise<ChatEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_GET_ALL)
}

/**
 * 根据 ID 获取聊天
 */
export async function invokeDbChatGetById(id: number): Promise<ChatEntity | undefined> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_GET_BY_ID, id)
}

/**
 * 更新聊天
 */
export async function invokeDbChatUpdate(data: ChatEntity): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_UPDATE, data)
}

/**
 * 删除聊天
 */
export async function invokeDbChatDelete(id: number): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_DELETE, id)
}

// ============ Database Operations - Message ============

/**
 * 保存消息
 */
export async function invokeDbMessageSave(data: MessageEntity): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_SAVE, data)
}

/**
 * 获取所有消息
 */
export async function invokeDbMessageGetAll(): Promise<MessageEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_GET_ALL)
}

/**
 * 根据 ID 获取消息
 */
export async function invokeDbMessageGetById(id: number): Promise<MessageEntity | undefined> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_GET_BY_ID, id)
}

/**
 * 根据多个 ID 获取消息
 */
export async function invokeDbMessageGetByIds(ids: number[]): Promise<MessageEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_GET_BY_IDS, ids)
}

/**
 * 更新消息
 */
export async function invokeDbMessageUpdate(data: MessageEntity): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_UPDATE, data)
}

/**
 * 删除消息
 */
export async function invokeDbMessageDelete(id: number): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_MESSAGE_DELETE, id)
}

// ============ Database Operations - Config ============

/**
 * 获取配置
 */
export async function invokeDbConfigGet(): Promise<IAppConfig | undefined> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_GET)
}

/**
 * 保存配置
 */
export async function invokeDbConfigSave(config: IAppConfig): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_SAVE, config)
}

/**
 * 初始化配置
 */
export async function invokeDbConfigInit(): Promise<IAppConfig> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CONFIG_INIT)
}

// ============ Chat Submit (Main-driven) ============

export async function invokeChatSubmit(data: {
  submissionId: string
  request: IUnifiedRequest
  chatId?: number
  chatUuid?: string
}): Promise<{ accepted: boolean; submissionId: string }> {
  const ipc = getElectronIPC()
  return await ipc.invoke(CHAT_SUBMIT_SUBMIT, data)
}

export async function invokeChatSubmitCancel(data: { submissionId: string; reason?: string }): Promise<{ cancelled: boolean }> {
  const ipc = getElectronIPC()
  return await ipc.invoke(CHAT_SUBMIT_CANCEL, data)
}

export function subscribeChatSubmitEvents(
  handler: (event: {
    type: string
    payload: any
    submissionId: string
    chatId?: number
    chatUuid?: string
    sequence: number
    timestamp: number
  }) => void
): () => void {
  const ipc = getElectronIPC()
  const listener = (_event: any, data: any) => handler(data)
  ipc.on(CHAT_SUBMIT_EVENT, listener)
  return () => ipc.removeListener(CHAT_SUBMIT_EVENT, listener)
}

// ============ Compression (Main-driven) ============

export async function invokeChatCompressionExecute(data: {
  submissionId: string
  chatId: number
  chatUuid: string
  messages: MessageEntity[]
  model: IModel
  provider: IProvider
  config?: CompressionConfig
}): Promise<CompressionResult> {
  const ipc = getElectronIPC()
  return await ipc.invoke(CHAT_COMPRESSION_EXECUTE, data)
}

export async function invokeChatTitleGenerate(data: {
  submissionId: string
  chatId?: number
  chatUuid?: string
  content: string
  model: IModel
  provider: IProvider
}): Promise<{ title: string }> {
  const ipc = getElectronIPC()
  return await ipc.invoke(CHAT_TITLE_GENERATE, data)
}

// ============ Database Operations - Chat Submit Event Trace ============

/**
 * 保存 chat submit 事件轨迹
 */
export async function invokeDbChatSubmitEventSave(data: ChatSubmitEventTrace): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke(DB_CHAT_SUBMIT_EVENT_SAVE, data)
}

// ============ CompressedSummary Operations ============

/**
 * 保存压缩摘要
 */
export async function invokeDbCompressedSummarySave(
  data: CompressedSummaryEntity
): Promise<number> {
  const ipc = getElectronIPC()
  return await ipc.invoke('db:compressed-summary:save', data)
}

/**
 * 获取聊天的所有压缩摘要
 */
export async function invokeDbCompressedSummaryGetByChatId(
  chatId: number
): Promise<CompressedSummaryEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke('db:compressed-summary:get-by-chat-id', chatId)
}

/**
 * 获取聊天的活跃压缩摘要
 */
export async function invokeDbCompressedSummaryGetActiveByChatId(
  chatId: number
): Promise<CompressedSummaryEntity[]> {
  const ipc = getElectronIPC()
  return await ipc.invoke('db:compressed-summary:get-active-by-chat-id', chatId)
}

/**
 * 更新压缩摘要状态
 */
export async function invokeDbCompressedSummaryUpdateStatus(
  id: number,
  status: 'active' | 'superseded' | 'invalid'
): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke('db:compressed-summary:update-status', id, status)
}

/**
 * 删除压缩摘要
 */
export async function invokeDbCompressedSummaryDelete(id: number): Promise<void> {
  const ipc = getElectronIPC()
  return await ipc.invoke('db:compressed-summary:delete', id)
}

// ============ Directory Selection ============

/**
 * 打开目录选择对话框
 */
export async function invokeSelectDirectory(): Promise<{ success: boolean; path: string | null }> {
  const ipc = getElectronIPC()
  return await ipc.invoke('select-directory')
}
