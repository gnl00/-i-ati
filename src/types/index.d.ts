interface IPrompt {
  embedded?: string | undefined // app embedded translate prompt
  useCustomePrompt?: boolean
  custom?: string // user custom prompt
}

declare interface IAppConfig {
  token?: string
  api?: string // default api
  model?: string // default model
  prompt?: IPrompt, // prompt
  version?: number
  configForUpdate?: IAppConfig
}

declare type AppConfigType = Omit<IAppConfig, 'configUpdate'>

declare interface IHeaders {
  accept?: string
  authorization?: string
  'content-type'?: string
}

declare interface ITranslateRequest {
  url: string
  token: string
  model: string
  prompt: string
  text: string
  sourceLang: string
  targetLang: string
}

declare interface IChatRequest {
  url: string
  token: string
  model: string
  prompt: string
  content: string
}

declare interface IChatRequestV2 {
  url: string
  token: string
  model: string
  prompt: string
  messages: ChatMessage[]
}

declare interface ChatEntity {
  id?: number; // 自增 id
  uuid: string;
  title: string; // 用户名
  messages: number[]; // 消息内容
  updateTime: number; // 更新时间
  createTime: number; // 创建时间
}

declare interface MessageEntity {
  id?: number;
  chatId?: number;
  chatUuid?: string;
  body: ChatMessage;
  tokens?: number;
}

declare interface ChatMessage {
  role: string;
  content: string | VLMContent[];
}

declare type LLMContent = string;

declare interface VLMContent {
  type: 'image_url' | 'text'
  text?: string;
  image_url?: VLMImgContent;
}

declare interface VLMImgContent {
  url: string;
  detail: 'auto' | 'low' | 'high';
}

declare type ClipbordImg = string | ArrayBuffer | null;

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
