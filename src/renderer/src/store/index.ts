import { VListHandle } from 'virtua'
import { create } from 'zustand'

const localProviders: IProvider[] = [
  {
      name: "OpenAI",
      models: [],
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiKey: ''
  },
  {
      name: "Anthropic",
      models: [],
      apiUrl: "https://api.anthropic.com/v1/messages",
      apiKey: ''
  },
  {
      name: "DeepSeek",
      models: [],
      apiUrl: "https://api.deepseek.com",
      apiKey: ''
  },
  {
      name: "SilliconFlow",
      models: [
          {
              provider: "Qwen",
              name: "Qwen2.5-7B-Instruct",
              value: "Qwen/Qwen2.5-7B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-14B-Instruct",
              value: "Qwen/Qwen2.5-14B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-32B-Instruct",
              value: "Qwen/Qwen2.5-32B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-72B-Instruct",
              value: "Qwen/Qwen2.5-72B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-Coder-7B-Instruct",
              value: "Qwen/Qwen2.5-Coder-7B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2.5-Coder-32B-Instruct",
              value: "Qwen/Qwen2.5-Coder-32B-Instruct",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "Qwen",
              name: "Qwen2-VL-72B-Instruct",
              value: "Qwen/Qwen2-VL-72B-Instruct",
              type: 'vlm'
          },
          {
              provider: "deepseek-ai",
              name: "DeepSeek-V2.5",
              value: "deepseek-ai/DeepSeek-V2.5",
              type: 'llm',
              ability: ['functioncalling']
          },
          {
              provider: "deepseek-ai",
              name: "deepseek-vl2",
              value: "deepseek-ai/deepseek-vl2",
              type: 'vlm'
          },
      ],
      apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
      apiKey: 'sk-qfhmqnmegjzjycpueslxveqpnqpvsyseoqjjieoiutxpzkpx'
  },
  {
      name: "MoonShot",
      models: [],
      apiUrl: "https://api.moonshot.cn/v1",
      apiKey: ''
  }
]

const localModels: IModel[] = [
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-7B-Instruct",
      value: "Qwen/Qwen2.5-7B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-14B-Instruct",
      value: "Qwen/Qwen2.5-14B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-32B-Instruct",
      value: "Qwen/Qwen2.5-32B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-72B-Instruct",
      value: "Qwen/Qwen2.5-72B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-Coder-7B-Instruct",
      value: "Qwen/Qwen2.5-Coder-7B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2.5-Coder-32B-Instruct",
      value: "Qwen/Qwen2.5-Coder-32B-Instruct",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "Qwen2-VL-72B-Instruct",
      value: "Qwen/Qwen2-VL-72B-Instruct",
      type: 'vlm'
  },
  {
      provider: "SilliconFlow",
      name: "DeepSeek-V2.5",
      value: "deepseek-ai/DeepSeek-V2.5",
      type: 'llm',
      ability: ['functioncalling']
  },
  {
      provider: "SilliconFlow",
      name: "deepseek-vl2",
      value: "deepseek-ai/deepseek-vl2",
      type: 'vlm'
  },
]

declare type ChatStoreType = {
  // editableContentId: number | undefined
  // setEditableContentId: (id: number) => void
  // imageSrcBase64List: ClipbordImg[]
  // setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  // chatListRef: React.RefObject<VListHandle>
  models: IModel[]
  setModels: (models: IModel[]) => void
  selectedModel: string | undefined
  setSelectedModel: (mode: string) => void
  // chatId: number | undefined
  // setChatId: (chatId: number | undefined) => void
  // chatUuid: string | undefined
  // setChatUuid: (uuid: string | undefined) => void
  // chatTitle: string | undefined
  // setChatTitle: (title: string) => void
  // chatList: ChatEntity[]
  // setChatList: (list: ChatEntity[]) => void
  messages: MessageEntity[]
  setMessages: (msgs: MessageEntity[]) => void
  sheetOpenState: boolean
  setSheetOpenState: (state: boolean) => void
  chatWindowHeight: number
  setChatWindowHeight: (height: number) => void
  fetchState: boolean
  setFetchState: (state: boolean) => void
  currentReqCtrl: AbortController | undefined
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => void
  // updateChatList: (chatEntity: ChatEntity) => void
  // lastMsgStatus: boolean
  // setLastMsgStatus: (state: boolean) => void
  provider: IProvider
  setProvider: (Provider: IProvider) => void
  providers: IProvider[]
  setProviders: (providers: IProvider[]) => void
  // appConfig: IAppConfig
  // setAppConfig: (config: IAppConfig) => void
  // appVersion: string
  readStreamState: boolean
  setReadStreamState: (state: boolean) => void
}
export const useChatStore = create<ChatStoreType>((set) => ({
  models: localModels.map(m => {
    const providerForModel = localProviders.find(p => p.name === m.provider)!
    m.provider = providerForModel
    console.log(m)
    return m
  }),
  setModels: (models: IModel[]) => set({ models: models }),
  selectedModel: 'Qwen/Qwen2.5-Coder-32B-Instruct',
  setSelectedModel: (mode: string) => set({ selectedModel: mode }),
  sheetOpenState: false,
  setSheetOpenState: (state: boolean) => set({ sheetOpenState: state }),
  messages: [],
  setMessages: (msgs: MessageEntity[]) => set({ messages: msgs }),
  chatWindowHeight: 800,
  setChatWindowHeight: (height: number) => set({ chatWindowHeight: height }),
  fetchState: false,
  setFetchState: (state: boolean) => set({ fetchState: state }),
  currentReqCtrl: undefined,
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => set({ currentReqCtrl: ctrl }),
  readStreamState: false,
  setReadStreamState: (state: boolean) => set({ readStreamState: state }),
  providers: localProviders,
  setProviders: (providers: IProvider[]) => set({ providers: providers }),
  provider: {
    name: "SilliconFlow",
    models: [
        {
            provider: "Qwen",
            name: "Qwen2.5-7B-Instruct",
            value: "Qwen/Qwen2.5-7B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2.5-14B-Instruct",
            value: "Qwen/Qwen2.5-14B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2.5-32B-Instruct",
            value: "Qwen/Qwen2.5-32B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2.5-72B-Instruct",
            value: "Qwen/Qwen2.5-72B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2.5-Coder-7B-Instruct",
            value: "Qwen/Qwen2.5-Coder-7B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2.5-Coder-32B-Instruct",
            value: "Qwen/Qwen2.5-Coder-32B-Instruct",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "Qwen",
            name: "Qwen2-VL-72B-Instruct",
            value: "Qwen/Qwen2-VL-72B-Instruct",
            type: 'vlm'
        },
        {
            provider: "deepseek-ai",
            name: "DeepSeek-V2.5",
            value: "deepseek-ai/DeepSeek-V2.5",
            type: 'llm',
            ability: ['functioncalling']
        },
        {
            provider: "deepseek-ai",
            name: "deepseek-vl2",
            value: "deepseek-ai/deepseek-vl2",
            type: 'vlm'
        },
    ],
    apiUrl: "https://api.siliconflow.cn/v1/chat/completions",
    apiKey: 'sk-qfhmqnmegjzjycpueslxveqpnqpvsyseoqjjieoiutxpzkpx'
  }, // current provider
  setProvider: (provider: IProvider) => set({ provider: provider }),
}))