declare type ModelType = 'llm' | 'vlm' | 't2i'

declare interface AccountModel {
  id: string
  label: string
  type: ModelType
  capabilities?: string[]
  enabled?: boolean
}

declare interface ProviderAccount {
  id: string
  providerId: string
  label: string
  /**
   * API Base URL (up to the version segment; endpoint path is added by the adapter).
   * The endpoint path (e.g., /chat/completions) will be added by the adapter.
   *
   * @example "https://api.openai.com/v1"
   * @example "https://api.anthropic.com/v1"
   * @example "https://openrouter.ai/api/v1"
   * @example "https://api.groq.com/openai/v1"  // Special case: includes provider-specific path
   *
   * ❌ Wrong: "https://api.openai.com/v1/chat/completions"
   * ❌ Wrong: "https://api.openai.com"
   * ✅ Correct: "https://api.openai.com/v1"
   */
  apiUrl: string
  apiKey: string
  models: AccountModel[]
}

declare interface ProviderDefinition {
  id: string
  displayName: string
  adapterType: ProviderType
  apiVersion?: ProviderAPIVersion
  iconKey?: string
  defaultApiUrl?: string
  requestOverrides?: Record<string, any>
}

declare interface ModelRef {
  accountId: string
  modelId: string
}

declare interface IAppConfig {
  providerDefinitions?: ProviderDefinition[]
  accounts?: ProviderAccount[]
  tools?: {
    titleGenerateModel?: ModelRef
    titleGenerateEnabled?: boolean
    maxWebSearchItems?: number
    memoryEnabled?: boolean
  }
  skills?: {
    folders?: string[]
  }
  compression?: CompressionConfig
  mcp?: { mcpServers?: {} }
  version?: number
  configForUpdate?: IAppConfig
}

declare type AppConfigType = Omit<IAppConfig, 'configUpdate'>

declare interface IHeaders {
  accept?: string
  authorization?: string
  'content-type'?: string
  'Access-Control-Allow-Origin'?: string
}

declare interface IChatRequest {
  /** API Base URL (endpoint path will be added by adapter) */
  baseUrl: string
  apiKey: string
  model: string
  prompt?: string
  content: string
  stream?: boolean | undefined
}

declare type ProviderType = string | 'openai' | 'claude' | 'azure-openai'
declare type ProviderAPIVersion = string | 'v1' | 'v2'

declare interface IUnifiedRequest {
  providerType?: ProviderType
  apiVersion?: ProviderAPIVersion
  /** API Base URL (endpoint path will be added by adapter) */
  baseUrl: string
  apiKey: string
  modelType?: string
  model: string
  prompt?: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: any[]
  requestOverrides?: Record<string, any>
  options?: {
    maxTokens?: number
  }
}

declare interface RequestSnapshot {
  providerDefinition: ProviderDefinition
  account: ProviderAccount
  model: AccountModel
  options?: IUnifiedRequest['options']
  providerType?: ProviderType
  apiVersion?: ProviderAPIVersion
  stream?: boolean
}

// 工具调用格式
declare interface IToolCall {
  id: string
  index?: number
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

// Token 使用统计
declare interface ITokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

declare interface IUnifiedResponse {
  id: string
  model: string
  timestamp: number
  content: string
  reasoning?: string
  toolCalls?: IToolCall[]
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  usage?: ITokenUsage
  raw?: any
}

// 流式响应增量数据
declare interface IUnifiedStreamResponse {
  id: string
  model: string
  delta?: {
    content?: string
    reasoning?: string
    toolCalls?: IToolCall[]
    finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
  }
  usage?: ITokenUsage
  raw?: any
}

declare interface IChatRequestV2 {
  /** API Base URL (endpoint path will be added by adapter) */
  baseUrl: string
  apiKey: string
  model: string
  prompt: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: any[]
}

declare interface MCPTool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

declare interface SkillMetadata {
  name: string
  frontmatterName?: string
  description: string
  license?: string
  compatibility?: string
  metadata?: Record<string, string>
  allowedTools?: string[]
  source?: string
}

declare interface ChatEntity {
  id?: number // 自增 id
  uuid: string
  title: string // 用户名
  messages: number[] // 消息 ID 列表
  msgCount?: number // 消息数量（缓存字段）
  model?: string // 最近使用的模型
  workspacePath?: string // 自定义工作空间路径（绝对路径）
  updateTime: number // 更新时间
  createTime: number // 创建时间
}

declare interface MessageEntity {
  id?: number
  chatId?: number
  chatUuid?: string
  body: ChatMessage
  tokens?: number
}

declare interface ChatSubmitEventTrace {
  id?: number
  submissionId: string
  chatId?: number
  chatUuid?: string
  sequence: number
  type: string
  timestamp: number
  payload?: any
  meta?: any
}

declare interface BaseChatMessage {
  role: string
  content: string | VLMContent[]
  name?: string // for role=function
  toolCallId?: string  // 驼峰命名，发送 API 时映射为 tool_call_id
  toolCalls?: IToolCall[]  // 驼峰命名，发送 API 时映射为 tool_calls
}

declare interface ChatMessage extends BaseChatMessage {
  model?: string
  modelRef?: { accountId: string; modelId: string }
  typewriterCompleted?: boolean,
  // ==================== Message Segments ====================
  // 使用segments替代原有的content、reasoning、toolCallResults字段
  segments: MessageSegment[]  // 强制字段，所有消息必须有segments
}

declare type LLMContent = string;

declare interface VLMContent {
  type: 'image_url' | 'text'
  text?: string;
  image_url?: VLMImgContent;
}

declare interface VLMImgContent {
  url: string;
  detail: 'auto' | 'low' | 'high'
}

declare type ClipbordImg = string | ArrayBuffer | null

declare interface IBaseResponse {
  id: string
  object: string
  created: number
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  systemFingerprint: string
}

// ==================== Message Segment Types ====================

// 文本片段
declare interface TextSegment {
  type: 'text'
  content: string
  timestamp: number
}

// 推理片段（thinking过程）
declare interface ReasoningSegment {
  type: 'reasoning'
  content: string
  timestamp: number
}

// 工具调用片段
declare interface ToolCallSegment {
  type: 'toolCall'
  name: string
  content: any
  cost?: number
  isError?: boolean
  timestamp: number
  toolCallId?: string  // 工具调用唯一标识（LLM 返回）
  toolCallIndex?: number  // 工具调用索引（数组位置）
}

// 错误片段
declare interface ErrorSegment {
  content?: string
  type: 'error'
  error: {
    name: string
    message: string
    stack?: string
    code?: string
    timestamp: number
  }
}

// 联合类型
declare type MessageSegment = TextSegment | ReasoningSegment | ToolCallSegment | ErrorSegment

// 工具调用结果（保持向后兼容）
declare interface ToolCallResult {
  name: string
  content: any
  cost?: number
  isError?: boolean
}

// ==================== Compression Types ====================

/**
 * 压缩摘要实体
 */
declare interface CompressedSummaryEntity {
  id?: number
  chatId: number
  chatUuid: string

  // 压缩范围
  messageIds: number[]  // 被压缩的消息 ID 列表
  startMessageId: number
  endMessageId: number

  // 压缩内容
  summary: string

  // 元数据
  originalTokenCount?: number
  summaryTokenCount?: number
  compressionRatio?: number

  // 压缩信息
  compressedAt: number
  compressionModel?: string
  compressionVersion?: number

  // 状态
  status?: 'active' | 'superseded' | 'invalid'
}

/**
 * 压缩配置
 */
declare interface CompressionConfig {
  enabled: boolean              // 是否启用压缩
  triggerThreshold: number      // 触发压缩的消息总数阈值（默认 30）
  keepRecentCount: number       // 保留最近的消息数量（默认 20）
  compressCount: number         // 每次压缩的消息数量（默认 10）
  compressionModel?: ModelRef   // 用于压缩的模型（默认使用当前模型）
  autoCompress: boolean         // 是否自动压缩（默认 true）
}

/**
 * 压缩结果
 */
declare interface CompressionResult {
  success: boolean
  summaryId?: number
  summary?: string
  messageIds?: number[]
  originalTokenCount?: number
  summaryTokenCount?: number
  compressionRatio?: number
  error?: string
}

/**
 * 压缩策略应用结果
 */
declare interface CompressionStrategy {
  shouldCompress: boolean       // 是否需要压缩
  messagesToCompress: number[]  // 需要压缩的消息 ID
  messagesToKeep: number[]      // 保留的消息 ID
  existingSummaries: CompressedSummaryEntity[]  // 已有的压缩摘要
}

// ==================== Assistant Types ====================

/**
 * AI 助手（Assistant）
 * 预配置的 AI 助手，包含模型和系统提示词
 */
declare interface Assistant {
  id: string                    // 唯一标识
  name: string                  // 助手名称
  icon?: string                 // 助手图标（emoji 或图标名称）
  description?: string          // 助手描述

  // 模型配置
  modelRef: ModelRef            // 使用的模型引用

  // 系统提示词
  systemPrompt: string          // 系统提示词（定义助手行为和对话风格）

  // 元数据
  createdAt: number             // 创建时间
  updatedAt: number             // 更新时间
  isBuiltIn?: boolean           // 是否为内置助手
  isDefault?: boolean           // 是否为默认助手
}
