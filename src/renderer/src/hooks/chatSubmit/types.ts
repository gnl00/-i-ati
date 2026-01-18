/**
 * 工具调用状态
 */
export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'failed' | 'aborted'

/**
 * 工具调用（统一的数据结构）
 * 包含工具调用的完整生命周期信息
 */
export interface ToolCall {
  /** 工具调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 工具参数（JSON 字符串） */
  args: string
  /** 执行状态 */
  status: ToolCallStatus
  /** 执行结果 */
  result?: any
  /** 错误信息 */
  error?: string
  /** 执行耗时（毫秒） */
  cost?: number
  /** 流式解析时的索引（用于累积参数） */
  index?: number
}

/**
 * @deprecated 使用 ToolCall 代替
 * 保留用于向后兼容
 */
export interface ToolCallProps {
  id?: string
  index?: number
  function: string
  args: string
}

export interface ChatInputState {
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  tools?: any[]
  prompt?: string
}

export interface ChatSessionState {
  userMessageEntity: MessageEntity
  messageEntities: MessageEntity[]
  chatMessages: ChatMessage[]
  chatEntity: ChatEntity
  currChatId: number | undefined
  workspacePath: string
}

export interface ChatControlState {
  controller: AbortController
  signal: AbortSignal
}

export interface ChatMetaState {
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
  snapshot: RequestSnapshot
}
