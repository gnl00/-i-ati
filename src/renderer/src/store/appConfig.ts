import { create } from 'zustand'
import { defaultConfig } from '../config'
import { providers as providerJsonData } from '../data'

// Initialization tracking
let configInitialized = false
let configInitPromise: Promise<void> | null = null

type AppConfigState = {
  appConfig: IAppConfig
  // Provider management
  providers: IProvider[]
  currentProviderName: string | undefined
  models: IModel[]
  provider: IProvider | undefined
  // Tool settings
  titleGenerateModel: IModel | undefined
  titleGenerateEnabled: boolean
  mcpServerConfig: { mcpServers?: {} }
}

type AppConfigAction = {
  _setAppConfig: (config: IAppConfig) => void
  setAppConfig: (config: IAppConfig) => Promise<void>
  getAppConfig: () => IAppConfig
  // Provider actions
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
  // Tool setting actions
  setTitleGenerateModel: (titleModel: IModel) => void
  setTitleGenerateEnabled: (state: boolean) => void
  setMcpServerConfig: (config: any) => void
}

export const useAppConfigStore = create<AppConfigState & AppConfigAction>((set, get) => ({
  // State - Config
  appConfig: defaultConfig,

  // State - Providers
  providers: defaultConfig.providers || providerJsonData,
  currentProviderName: '',

  // State - Tool settings
  titleGenerateModel: defaultConfig.tools?.titleGenerateModel || undefined,
  titleGenerateEnabled: defaultConfig.tools?.titleGenerateEnabled ?? true,
  mcpServerConfig: { ...defaultConfig.mcp },

  // Computed - Models (derived from providers)
  get models() {
    return get().providers.flatMap(p => p.models.filter(m => m.enable !== false))
  },

  // Computed - Current provider
  get provider() {
    const { providers, currentProviderName } = get()
    return providers.find(p => p.name === currentProviderName)
  },

  // Internal setter (used by initializeAppConfig)
  _setAppConfig: (config: IAppConfig) => {
    set({
      appConfig: config,
      providers: config.providers || providerJsonData,
      titleGenerateModel: config.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: config.tools?.titleGenerateEnabled ?? true,
      mcpServerConfig: { ...config.mcp }
    })
  },

  // Public setter (saves to IndexedDB)
  setAppConfig: async (updatedConfig: IAppConfig) => {
    const { saveConfig } = await import('../db/ConfigRepository')
    await saveConfig(updatedConfig)
    set({
      appConfig: updatedConfig,
      providers: updatedConfig.providers || providerJsonData,
      titleGenerateModel: updatedConfig.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: updatedConfig.tools?.titleGenerateEnabled ?? true,
      mcpServerConfig: { ...updatedConfig.mcp }
    })
  },

  // Getter
  getAppConfig: () => get().appConfig,

  // Provider actions
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
      targetModel?.enable === true;

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

  // Tool setting actions
  setTitleGenerateModel: (tmodel: IModel) => set({ titleGenerateModel: tmodel }),
  setTitleGenerateEnabled: (state: boolean) => set({ titleGenerateEnabled: state }),
  setMcpServerConfig: (config: any) => set({ mcpServerConfig: config })
}))

// Async initialization function
export const initializeAppConfig = async (): Promise<void> => {
  if (configInitialized) return
  if (configInitPromise) return configInitPromise

  configInitPromise = (async () => {
    try {
      const { initConfig } = await import('../db/ConfigRepository')
      const loadedConfig = await initConfig()
      useAppConfigStore.getState()._setAppConfig(loadedConfig)
      configInitialized = true
      console.log('[@i] App config initialized from IndexedDB')
    } catch (error) {
      console.error('Failed to load config from IndexedDB:', error)
      configInitialized = true
    }
  })()

  return configInitPromise
}
