import { GET_CONFIG, SAVE_CONFIG } from '@constants/index'
import { create } from 'zustand'
import providerJsonData from '../data/providers.json'

const localAppConfig: IAppConfig = await window.electron.ipcRenderer.invoke(GET_CONFIG)

const providersData: IProvider[] = localAppConfig.providers || providerJsonData

type ChatState = {
  // Config data
  appConfig: IAppConfig
  appVersion: string
  // Core data - providers is the single source of truth
  currentProviderName: string | undefined
  providers: IProvider[]
  // Derived getters (computed from providers)
  models: IModel[]
  provider: IProvider | undefined
  selectedModel: IModel | undefined
  messages: MessageEntity[]
  imageSrcBase64List: ClipbordImg[]
  chatWindowHeight: number
  fetchState: boolean
  currentReqCtrl: AbortController | undefined
  readStreamState: boolean
  showLoadingIndicator: boolean
  titleGenerateEnabled: boolean
  titleGenerateModel: IModel | undefined
  webSearchEnable: boolean
  webSearchProcessing: boolean
  artifacts: boolean
  artifactsPanelOpen: boolean
  artifactsActiveTab: string
  mcpServerConfig: { mcpServers?: {} }
}

// Actions
type ChatAction = {
  setAppConfig: (config: IAppConfig) => void
  loadAppConfig: () => Promise<void>
  setImageSrcBase64List: (imgs: ClipbordImg[]) => void
  setProviders: (providers: IProvider[]) => void
  setCurrentProviderName: (providerName: string) => void
  getProviderByName: (providerName: string) => IProvider | undefined
  updateProvider: (providerName: string, updates: Partial<IProvider>) => void
  addProvider: (provider: IProvider) => void
  removeProvider: (providerName: string) => void
  updateModel: (providerName: string, modelValue: string, updates: Partial<IModel>) => void
  addModel: (providerName: string, model: IModel) => void
  removeModel: (providerName: string, modelValue: string) => void
  toggleModelEnable: (providerName: string, modelValue: string) => void
  setSelectedModel: (mode: IModel) => void
  setMessages: (msgs: MessageEntity[]) => void
  setChatWindowHeight: (height: number) => void
  setFetchState: (state: boolean) => void
  setCurrentReqCtrl: (ctrl: AbortController | undefined) => void
  setTitleGenerateModel: (titleModel: IModel) => void
  setReadStreamState: (state: boolean) => void
  setShowLoadingIndicator: (show: boolean) => void
  toggleWebSearch: (state: boolean) => void
  setWebSearchProcessState: (state: boolean) => void
  toggleArtifacts: (state: boolean) => void
  toggleArtifactsPanel: () => void
  setArtifactsPanel: (open: boolean) => void
  setArtifactsActiveTab: (tab: string) => void
  setTitleGenerateEnabled: (state: boolean) => void
  setMcpServerConfig: (config: any) => void
}

export const useChatStore = create<ChatState & ChatAction>((set, get) => ({
  // Core data
  appConfig: localAppConfig,
  async loadAppConfig() {
    const localConfig = await window.electron.ipcRenderer.invoke(GET_CONFIG)
    // console.log('store get local app config', localConfig);
    return localConfig
  },
  setAppConfig: (updatedConfig: IAppConfig) => {
    window.electron.ipcRenderer.invoke(SAVE_CONFIG, updatedConfig)
    set({ appConfig: updatedConfig })
  },
  // @ts-ignore
  appVersion: __APP_VERSION__,
  providers: providersData,
  currentProviderName: '',

  // Derived getters (computed from providers)
  get models() {
    return get().providers.flatMap(p => p.models.filter(m => m.enable !== false))
  },

  get provider() {
    const { providers, currentProviderName } = get()
    // console.log('provider from store', currentProviderName, providers)
    return providers.find(p => p.name === currentProviderName)
  },

  // Actions
  setProviders: (providers: IProvider[]) => set({ providers }),

  setCurrentProviderName: (providerName: string) => set((state) => ({
    currentProviderName: providerName,
    provider: state.providers.find(p => p.name === providerName)
  })),
  getProviderByName: (providerName: string) => {
    const { providers } = get()
    return providers.find(p => p.name === providerName)
  },
  updateProvider: (providerName: string, updates: Partial<IProvider>) => set((state) => ({
    providers: state.providers.map(p => {
      if (p.name === providerName) {
        const nextP = { ...p, ...updates }
        // console.log('store updated', nextP)
        nextP.models = nextP.models.map(m => {
          m.provider = nextP.name
          return m
        })
        return nextP
      } else {
        return p
      }
    })
  })),

  addProvider: (provider: IProvider) => set((state) => ({
    providers: [provider, ...state.providers],
    currentProviderName: provider.name
  })),

  removeProvider: (providerName: string) => set((state) => {
    const newProviders = state.providers.filter(p => p.name !== providerName)
    const shouldClearTitleModel = state.titleGenerateModel &&
      state.titleGenerateModel.provider === providerName;

    return {
      providers: newProviders,
      currentProviderName: state.currentProviderName === providerName
        ? (newProviders[0]?.name || undefined)
        : state.currentProviderName,
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
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

  removeModel: (providerName: string, modelValue: string) => set((state) => {
    const shouldClearTitleModel = state.titleGenerateModel &&
      state.titleGenerateModel.provider === providerName &&
      state.titleGenerateModel.value === modelValue;

    return {
      providers: state.providers.map(p =>
        p.name === providerName
          ? { ...p, models: p.models.filter(m => m.value !== modelValue) }
          : p
      ),
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
    };
  }),

  toggleModelEnable: (providerName: string, modelValue: string) => set((state) => {
    const targetModel = state.providers
      .find(p => p.name === providerName)
      ?.models.find(m => m.value === modelValue);

    const shouldClearTitleModel = state.titleGenerateModel &&
      state.titleGenerateModel.provider === providerName &&
      state.titleGenerateModel.value === modelValue &&
      targetModel?.enable === true; // Only clear if we're disabling (currently enabled)

    return {
      providers: state.providers.map(p =>
        p.name === providerName
          ? {
            ...p,
            models: p.models.map(m =>
              m.value === modelValue ? { ...m, enable: !m.enable } : m
            )
          }
          : p
      ),
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
    };
  }),

  selectedModel: undefined,
  setSelectedModel: (mode: IModel) => set({ selectedModel: mode }),
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
  titleGenerateModel: localAppConfig.tools?.titleGenerateModel || undefined,
  setTitleGenerateModel: (tmodel: IModel) => set({ titleGenerateModel: tmodel }),
  imageSrcBase64List: [],
  setImageSrcBase64List: (imgs: ClipbordImg[]) => set({ imageSrcBase64List: imgs }),
  webSearchEnable: false,
  toggleWebSearch: (state: boolean) => (set({ webSearchEnable: state })),
  webSearchProcessing: false,
  setWebSearchProcessState: (state: boolean) => (set({ webSearchProcessing: state })),
  showLoadingIndicator: false,
  setShowLoadingIndicator: (state: boolean) => (set({ showLoadingIndicator: state })),
  artifacts: false,
  toggleArtifacts: (state: boolean) => (set({ artifacts: state })),
  artifactsPanelOpen: false,
  artifactsActiveTab: 'preview',
  toggleArtifactsPanel: () => set((state) => ({ artifactsPanelOpen: !state.artifactsPanelOpen })),
  setArtifactsPanel: (open: boolean) => set({ artifactsPanelOpen: open }),
  setArtifactsActiveTab: (tab: string) => set({ artifactsActiveTab: tab }),
  titleGenerateEnabled: localAppConfig.tools?.titleGenerateEnabled ?? true,
  setTitleGenerateEnabled: (state: boolean) => (set({ titleGenerateEnabled: state })),
  mcpServerConfig: { ...localAppConfig.mcp },
  setMcpServerConfig: (config: any) => (set({ mcpServerConfig: config }))
}))