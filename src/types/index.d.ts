declare interface IModel {
  enable?: boolean
  provider: string // providerName
  name: string
  value: string
  type: string
  ability?: string[]
}

// Provider 类型枚举
declare type ProviderType = 'openai' | 'claude' | 'gemini' | 'azure-openai' | 'ollama' | 'other'

declare interface IProvider {
  name: string        // 用户自定义名称
  type: ProviderType  // 标准化的 Provider 类型
  apiUrl: string
  apiKey: string
  apiVersion?: string // API 版本，如 'v1', 'v2', 'legacy'
  models: IModel[]
}

declare interface IAppConfig {
  providers?: IProvider[]
  tools?: {
    titleGenerateModel?: IModel
    titleGenerateEnabled?: boolean
    maxWebSearchItems?: number
  }
  mcp?: {mcpServers?: {}}
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
  baseUrl: string
  apiKey: string
  model: string
  prompt?: string
  content: string
  stream?: boolean | undefined
}

declare interface IChatRequestV2 {
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

declare interface ChatEntity {
  id?: number // 自增 id
  uuid: string
  title: string // 用户名
  messages: number[] // 消息内容
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

declare interface ChatMessage {
  model?: string
  role: string;
  content: string | VLMContent[]
  reasoning?: string
  name?: string // for role=function
  artifatcs?: boolean
  toolCallResults?: any
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

// 统一请求接口
declare interface IUnifiedChatRequest {
  providerType: ProviderType  // 使用标准化类型
  providerName: string        // 保留用户自定义名称用于日志等
  model: string
  messages: ChatMessage[]
  apiKey: string
  baseUrl: string
  stream?: boolean
  tools?: any[]
  prompt?: string
  apiVersion?: string
  options?: {
    temperature?: number
    topP?: number
    maxTokens?: number
  }
}

// 工具调用格式
declare interface IToolCall {
  id: string
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

// 统一的响应格式
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

// 流式响应的 delta 格式
declare interface IUnifiedStreamDelta {
  content?: string
  reasoning?: string
  toolCalls?: IToolCall[]
  finishReason?: string
  usage?: ITokenUsage
}

// 流式响应的完整格式
declare interface IUnifiedStreamResponse {
  id: string
  model: string
  delta: IUnifiedStreamDelta
  raw?: any
}

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
