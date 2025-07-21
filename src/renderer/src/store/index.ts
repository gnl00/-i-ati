import { create } from 'zustand'
import providerJsonData from '../../../../data/providers.json'

const providersData: IProvider[] = providerJsonData

const localModels: IModel[] = [
    {
        provider: "OpenAI",
        name: "gpt-4o-mini",
        value: "gpt-4o-mini",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "OpenAI",
        name: "gpt-4o",
        value: "gpt-4o",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "OpenRouter",
        name: "qwen/qwen3-14b:free",
        value: "qwen/qwen3-14b:free",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "OpenRouter",
        name: "deepseek/deepseek-r1-distill-llama-70b:free",
        value: "deepseek/deepseek-r1-distill-llama-70b:free",
        type: 'llm',
        ability: ['functioncalling']
    },
    {
        provider: "OpenRouter",
        name: "deepseek/deepseek-r1-0528:free",
        value: "deepseek/deepseek-r1-0528:free",
        type: 'llm',
        ability: ['functioncalling']
    },
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
  imageSrcBase64List: ClipbordImg[]
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  // chatListRef: React.RefObject<VListHandle>
  
  // Core data - providers is the single source of truth
  providers: IProvider[]
  currentProviderName: string | undefined
  
  // Derived getters (computed from providers)
  models: IModel[]
  provider: IProvider | undefined
  
  // Actions
  setProviders: (providers: IProvider[]) => void
  setCurrentProviderName: (providerName: string) => void
  updateProvider: (providerName: string, updates: Partial<IProvider>) => void
  addProvider: (provider: IProvider) => void
  removeProvider: (providerName: string) => void
  updateModel: (providerName: string, modelValue: string, updates: Partial<IModel>) => void
  addModel: (providerName: string, model: IModel) => void
  removeModel: (providerName: string, modelValue: string) => void
  toggleModelEnable: (providerName: string, modelValue: string) => void
  
  selectedModel: string | undefined
  setSelectedModel: (mode: string) => void
  // chatContent: string
  // setChatContent: (content: string) => void
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
  chatWindowHeight: number
  setChatWindowHeight: (height: number) => void
  fetchState: boolean
  setFetchState: (state: boolean) => void
  currentReqCtrl: AbortController | undefined
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => void
  // updateChatList: (chatEntity: ChatEntity) => void
  // lastMsgStatus: boolean
  // setLastMsgStatus: (state: boolean) => void

  titleProvider: IProvider
  setTitleProvider: (Provider: IProvider) => void
  selectedTitleModel: string | undefined
  setSelectedTitleModel: (mode: string) => void

  appConfig: IAppConfig
  setAppConfig: (config: IAppConfig) => void
  appVersion: string
  readStreamState: boolean
  setReadStreamState: (state: boolean) => void
}

export const useChatStore = create<ChatStoreType>((set, get) => ({
  // Core data
  providers: providersData,
  currentProviderName: '',
  
  // Derived getters (computed from providers)
  get models() {
    return get().providers.flatMap(p => p.models.filter(m => m.enable !== false))
  },
  
  get provider() {
    const { providers, currentProviderName } = get()
    console.log('from store', currentProviderName, providers)
    return providers.find(p => p.name === currentProviderName)
  },
  
  // Actions
  setProviders: (providers: IProvider[]) => set({ providers }),
  
  setCurrentProviderName: (providerName: string) => set((state) => ({ 
    currentProviderName: providerName,
    provider: state.providers.find(p => p.name === providerName)
  })),
  
  updateProvider: (providerName: string, updates: Partial<IProvider>) => set((state) => ({
    providers: state.providers.map(p => {
        if (p.name === providerName) {
            const nextP = { ...p, ...updates }
            console.log('store updated', nextP)
            return nextP
        } else {
            return p
        }
    })
  })),
  
  addProvider: (provider: IProvider) => set((state) => ({
    providers: [...state.providers, provider],
    currentProviderName: provider.name
  })),
  
  removeProvider: (providerName: string) => set((state) => {
    const newProviders = state.providers.filter(p => p.name !== providerName)
    return {
      providers: newProviders,
      currentProviderName: state.currentProviderName === providerName 
        ? (newProviders[0]?.name || undefined)
        : state.currentProviderName
    }
  }),
  
  updateModel: (providerName: string, modelValue: string, updates: Partial<IModel>) => set((state) => ({
    providers: state.providers.map(p => 
      p.name === providerName 
        ? {
            ...p,
            models: p.models.map(m => 
              m.value === modelValue ? { ...m, ...updates } : m
            )
          }
        : p
    )
  })),
  
  addModel: (providerName: string, model: IModel) => set((state) => ({
    providers: state.providers.map(p => 
      p.name === providerName 
        ? { ...p, models: [...p.models, { ...model, provider: providerName }] }
        : p
    ),
    models: [...state.models, model]
  })),
  
  removeModel: (providerName: string, modelValue: string) => set((state) => ({
    providers: state.providers.map(p => 
      p.name === providerName 
        ? { ...p, models: p.models.filter(m => m.value !== modelValue) }
        : p
    )
  })),
  
  toggleModelEnable: (providerName: string, modelValue: string) => set((state) => ({
    providers: state.providers.map(p => 
      p.name === providerName 
        ? {
            ...p,
            models: p.models.map(m => 
              m.value === modelValue ? { ...m, enable: !m.enable } : m
            )
          }
        : p
    )
  })),
  
  selectedModel: '',
  setSelectedModel: (mode: string) => set({ selectedModel: mode }),
  selectedTitleModel: 'qwen/qwen3-14b:free',
  setSelectedTitleModel: (mode: string) => set({ selectedTitleModel: mode }),
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
  titleProvider: {
    name: "OpenAI",
    models: [
        {
            provider: "OpenAI",
            name: "gpt-4o-mini",
            value: "gpt-4o-mini",
            type: 'llm',
            ability: ['functioncalling']
        },
    ],
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKey: 'sk-xxx'
  },
  setTitleProvider: (provider: IProvider) => set({ titleProvider: provider }),
  appConfig: {providers: providersData},
  setAppConfig: (appConfig: IAppConfig) => set({ appConfig: appConfig }),
  // @ts-ignore
  appVersion: __APP_VERSION__,
  //   chatContent: '',
  //   setChatContent: (content: string) => set({ chatContent: content }),
  imageSrcBase64List: [],
  setImageSrcBase64List: (imgs: ClipbordImg[]) => set({ imageSrcBase64List: imgs }),
}))