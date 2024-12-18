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


declare interface IChatContent {
  role: string
  content: string
}

declare interface IChatRequestV2 {
  url: string
  token: string
  model: string
  prompt: string
  messages: IChatContent[]
}

declare interface IChatRequest {
  url: string
  token: string
  model: string
  prompt: string
  content: string
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
