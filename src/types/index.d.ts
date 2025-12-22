declare interface IModel {
  enable?: boolean
  provider: string // providerName
  name: string
  value: string
  type: string
  ability?: string[]
}

declare interface IProvider {
  name: string
  apiUrl: string
  apiKey: string
  models: IModel[]
}

declare interface IAppConfig {
  providers?: IProvider[]
  tools?: {
    titleGenerateModel?: IModel
    titleGenerateEnabled?: boolean
    maxWebSearchItems?: number
  }
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
  baseUrl: string
  apiKey: string
  modelType?: string
  model: string
  prompt: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: any[]
  options: {
    temperature?: number
    maxTokens?: number
    topP?: number
  }
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
  raw?: any
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
  typewriterCompleted?: boolean
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
