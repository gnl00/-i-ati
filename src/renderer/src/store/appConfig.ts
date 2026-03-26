import { create } from 'zustand'
import { toast } from 'sonner'
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import { defaultConfig } from '../config'

// Initialization tracking
let configInitialized = false
let configInitPromise: Promise<void> | null = null
let configEventsSubscribed = false
let pluginEventsSubscribed = false
const logger = createRendererLogger('AppConfigStore')

export type ModelOption = {
  account: ProviderAccount
  model: AccountModel
  definition: ProviderDefinition
}

export type ProviderEntry = {
  definition: ProviderDefinition
  account?: ProviderAccount
  models: AccountModel[]
}

const normalizeProviderId = (value: string): string => {
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

const normalizeProviderIdSafe = (value: string): string => {
  const normalized = normalizeProviderId(value)
  return normalized || value
}

const normalizeProviderDefinitions = (
  definitions: ProviderDefinition[] = []
): ProviderDefinition[] => {
  const byId = new Map<string, ProviderDefinition>()
  definitions.forEach(def => {
    const normalizedId = normalizeProviderIdSafe(def.id || def.displayName || '')
    if (!normalizedId) {
      return
    }
    const nextDef = normalizedId === def.id ? def : { ...def, id: normalizedId }
    if (!byId.has(normalizedId)) {
      byId.set(normalizedId, nextDef)
    }
  })
  return Array.from(byId.values())
}

const normalizeAccounts = (
  accounts: ProviderAccount[] = [],
  preferAccountId?: string
): ProviderAccount[] => {
  const normalized = accounts.map(account => {
    const normalizedProviderId = normalizeProviderIdSafe(account.providerId)
    if (normalizedProviderId === account.providerId) {
      return account
    }
    return { ...account, providerId: normalizedProviderId }
  })

  const seen = new Set<string>()
  const deduped: ProviderAccount[] = []

  if (preferAccountId) {
    const preferred = normalized.find(account => account.id === preferAccountId)
    if (preferred) {
      deduped.push(preferred)
      seen.add(preferred.providerId)
    }
  }

  normalized.forEach(account => {
    if (seen.has(account.providerId)) {
      return
    }
    seen.add(account.providerId)
    deduped.push(account)
  })

  return deduped
}

const buildProviderEntries = (
  providerDefinitions: ProviderDefinition[] = [],
  accounts: ProviderAccount[] = []
): ProviderEntry[] => {
  return providerDefinitions.map(definition => {
    const account = accounts.find(item => item.providerId === definition.id)
    return {
      definition,
      account,
      models: account?.models ?? []
    }
  })
}

const persistProviderDefinitions = async (
  previous: ProviderDefinition[],
  next: ProviderDefinition[]
): Promise<void> => {
  try {
    const { saveProviderDefinition, deleteProviderDefinition } = await import('../db/ProviderRepository')
    const prevIds = new Set(previous.map(def => def.id))
    const nextIds = new Set(next.map(def => def.id))

    await Promise.all(next.map(def => saveProviderDefinition(def)))
    const removed = Array.from(prevIds).filter(id => !nextIds.has(id))
    await Promise.all(removed.map(id => deleteProviderDefinition(id)))
  } catch (error) {
    logger.error('provider_definitions.persist_failed', error)
  }
}

const persistProviderAccounts = async (
  previous: ProviderAccount[],
  next: ProviderAccount[]
): Promise<void> => {
  try {
    const { saveProviderAccount, deleteProviderAccount } = await import('../db/ProviderRepository')
    const prevIds = new Set(previous.map(account => account.id))
    const nextIds = new Set(next.map(account => account.id))

    await Promise.all(next.map(account => saveProviderAccount(account)))
    const removed = Array.from(prevIds).filter(id => !nextIds.has(id))
    await Promise.all(removed.map(id => deleteProviderAccount(id)))
  } catch (error) {
    logger.error('provider_accounts.persist_failed', error)
    if (error instanceof Error && error.message.includes('Provider not found')) {
      toast.error('Provider not found. Please select a valid provider before saving.')
    }
  }
}

const persistProviderAccount = async (account: ProviderAccount): Promise<void> => {
  try {
    const { saveProviderAccount } = await import('../db/ProviderRepository')
    await saveProviderAccount(account)
  } catch (error) {
    logger.error('provider_account.persist_failed', error)
    if (error instanceof Error && error.message.includes('Provider not found')) {
      toast.error('Provider not found. Please select a valid provider before saving.')
    }
  }
}

const removeProviderAccount = async (accountId: string): Promise<void> => {
  try {
    const { deleteProviderAccount } = await import('../db/ProviderRepository')
    await deleteProviderAccount(accountId)
  } catch (error) {
    logger.error('provider_account.delete_failed', error)
  }
}

const persistProviderModel = async (accountId: string, model: AccountModel): Promise<void> => {
  try {
    const { saveProviderModel } = await import('../db/ProviderRepository')
    await saveProviderModel(accountId, model)
  } catch (error) {
    logger.error('provider_model.persist_failed', error)
  }
}

const removeProviderModel = async (accountId: string, modelId: string): Promise<void> => {
  try {
    const { deleteProviderModel } = await import('../db/ProviderRepository')
    await deleteProviderModel(accountId, modelId)
  } catch (error) {
    logger.error('provider_model.delete_failed', error)
  }
}

const setProviderModelEnabled = async (accountId: string, modelId: string, enabled: boolean): Promise<void> => {
  try {
    const { setProviderModelEnabled } = await import('../db/ProviderRepository')
    await setProviderModelEnabled(accountId, modelId, enabled)
  } catch (error) {
    logger.error('provider_model.set_enabled_failed', error)
  }
}

type AppConfigState = {
  appVersion: string
  appConfig: IAppConfig
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
  providersRevision: number
  currentAccountId: string | undefined
  defaultModel: ModelRef | undefined
  titleGenerateModel: ModelRef | undefined
  titleGenerateEnabled: boolean
  memoryEnabled: boolean
  streamChunkDebugEnabled: boolean
  mcpServerConfig: McpServerConfig
  savedMcpServerConfig: McpServerConfig
  mcpConfigLoaded: boolean
  plugins: PluginEntity[]
  savedPlugins: PluginEntity[]
  pluginsLoaded: boolean
  remotePlugins: RemotePluginCatalogItem[]
  remotePluginsLoaded: boolean
  compression: CompressionConfig | undefined
}

type AppConfigAction = {
  _setAppConfig: (config: IAppConfig) => void
  _setLoadedMcpServerConfig: (config: McpServerConfig) => void
  _setLoadedPlugins: (plugins: PluginEntity[]) => void
  _setLoadedRemotePlugins: (plugins: RemotePluginCatalogItem[]) => void
  setAppConfig: (config: IAppConfig) => Promise<void>
  refreshAppConfig: () => Promise<void>
  getAppConfig: () => IAppConfig

  setProviderDefinitions: (definitions: ProviderDefinition[]) => void
  setAccounts: (accounts: ProviderAccount[]) => void
  setCurrentAccountId: (accountId: string | undefined) => void

  getProviderDefinitionById: (providerId: string) => ProviderDefinition | undefined
  getAccountById: (accountId: string) => ProviderAccount | undefined
  getAccountModel: (accountId: string, modelId: string) => AccountModel | undefined
  getProviderEntries: () => ProviderEntry[]
  resolveModelRef: (ref?: ModelRef) => ModelOption | undefined
  getModelOptions: () => ModelOption[]

  addAccount: (account: ProviderAccount) => void
  addProviderWithAccount: (definition: ProviderDefinition, account: ProviderAccount) => Promise<void>
  updateAccount: (accountId: string, updates: Partial<ProviderAccount>) => void
  removeAccount: (accountId: string) => void

  addModel: (accountId: string, model: AccountModel) => void
  updateModel: (accountId: string, modelId: string, updates: Partial<AccountModel>) => void
  removeModel: (accountId: string, modelId: string) => void
  toggleModelEnabled: (accountId: string, modelId: string) => void

  setDefaultModel: (modelRef: ModelRef | undefined) => void
  setTitleGenerateModel: (modelRef: ModelRef | undefined) => void
  setTitleGenerateEnabled: (state: boolean) => void
  setMemoryEnabled: (state: boolean) => void
  setStreamChunkDebugEnabled: (state: boolean) => void
  setMcpServerConfig: (config: McpServerConfig) => void
  saveMcpServerConfig: (config: McpServerConfig) => Promise<void>
  setPlugins: (plugins: PluginEntity[]) => void
  savePlugins: (plugins: PluginEntity[]) => Promise<void>
  refreshPlugins: () => Promise<void>
  refreshRemotePlugins: () => Promise<void>
  installRemotePlugin: (pluginId: string) => Promise<void>
  importLocalPlugin: (sourceDir: string) => Promise<void>
  uninstallLocalPlugin: (pluginId: string) => Promise<void>
}

export const useAppConfigStore = create<AppConfigState & AppConfigAction>((set, get) => ({
  // @ts-ignore
  appVersion: __APP_VERSION__,
  // State - Config
  appConfig: defaultConfig,
  providerDefinitions: defaultConfig.providerDefinitions || [],
  accounts: defaultConfig.accounts || [],
  providersRevision: 0,
  currentAccountId: undefined,
  defaultModel: defaultConfig.tools?.defaultModel || undefined,

  // State - Tool settings
  titleGenerateModel: defaultConfig.tools?.titleGenerateModel || undefined,
  titleGenerateEnabled: defaultConfig.tools?.titleGenerateEnabled ?? true,
  memoryEnabled: defaultConfig.tools?.memoryEnabled ?? true,
  streamChunkDebugEnabled: defaultConfig.tools?.streamChunkDebugEnabled ?? false,
  mcpServerConfig: { mcpServers: {} },
  savedMcpServerConfig: { mcpServers: {} },
  mcpConfigLoaded: false,
  plugins: [],
  savedPlugins: [],
  pluginsLoaded: false,
  remotePlugins: [],
  remotePluginsLoaded: false,

  // State - Compression settings
  compression: defaultConfig.compression,

  // Internal setter (used by initializeAppConfig)
  _setAppConfig: (config: IAppConfig) => {
    const nextProviderDefinitions = normalizeProviderDefinitions(
      config.providerDefinitions || []
    )
    const nextAccounts = normalizeAccounts(config.accounts || [])

    set({
      appConfig: {
        ...config,
        providerDefinitions: nextProviderDefinitions,
        accounts: nextAccounts
      },
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts,
      providersRevision: 0,
      defaultModel: config.tools?.defaultModel || undefined,
      titleGenerateModel: config.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: config.tools?.titleGenerateEnabled ?? true,
      memoryEnabled: config.tools?.memoryEnabled ?? true,
      streamChunkDebugEnabled: config.tools?.streamChunkDebugEnabled ?? false,
      compression: config.compression
    })
  },

  _setLoadedMcpServerConfig: (config: McpServerConfig) => {
    const nextConfig = config?.mcpServers && typeof config.mcpServers === 'object'
      ? config
      : { mcpServers: {} }
    set({
      mcpServerConfig: nextConfig,
      savedMcpServerConfig: nextConfig,
      mcpConfigLoaded: true
    })
  },

  _setLoadedPlugins: (plugins: PluginEntity[]) => {
    set({
      plugins,
      savedPlugins: plugins,
      pluginsLoaded: true
    })
  },

  _setLoadedRemotePlugins: (plugins: RemotePluginCatalogItem[]) => {
    set({
      remotePlugins: plugins,
      remotePluginsLoaded: true
    })
  },

  // Public setter (saves to SQLite)
  setAppConfig: async (updatedConfig: IAppConfig) => {
    const { saveConfig } = await import('../db/ConfigRepository')
    const nextProviderDefinitions = normalizeProviderDefinitions(
      updatedConfig.providerDefinitions || []
    )
    const nextAccounts = normalizeAccounts(updatedConfig.accounts || [])

    const nextConfig = {
      ...updatedConfig,
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts
    }

    const { providerDefinitions: _defs, accounts: _accounts, ...baseConfig } = nextConfig

    await saveConfig(baseConfig)
    set({
      appConfig: baseConfig,
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts,
      providersRevision: 0,
      defaultModel: nextConfig.tools?.defaultModel || undefined,
      titleGenerateModel: nextConfig.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: nextConfig.tools?.titleGenerateEnabled ?? true,
      memoryEnabled: nextConfig.tools?.memoryEnabled ?? true,
      streamChunkDebugEnabled: nextConfig.tools?.streamChunkDebugEnabled ?? false,
      compression: nextConfig.compression
    })
  },

  refreshAppConfig: async () => {
    const { getConfig } = await import('../db/ConfigRepository')
    const loadedConfig = await getConfig()
    if (!loadedConfig) {
      return
    }
    get()._setAppConfig(loadedConfig)
  },

  // Getter
  getAppConfig: () => {
    const state = get()
    return {
      ...state.appConfig,
      providerDefinitions: state.providerDefinitions,
      accounts: state.accounts
    }
  },

  setProviderDefinitions: (definitions) => {
    const prevDefinitions = get().providerDefinitions
    const nextDefinitions = normalizeProviderDefinitions(definitions)
    set((state) => ({
      providerDefinitions: nextDefinitions,
      accounts: normalizeAccounts(state.accounts),
      providersRevision: state.providersRevision + 1
    }))
    void persistProviderDefinitions(prevDefinitions, nextDefinitions)
  },
  setAccounts: (accounts) => {
    const prevAccounts = get().accounts
    const nextAccounts = normalizeAccounts(accounts)
    set((state) => ({
      accounts: nextAccounts,
      providersRevision: state.providersRevision + 1
    }))
    void persistProviderAccounts(prevAccounts, nextAccounts)
  },
  setCurrentAccountId: (accountId) => set({ currentAccountId: accountId }),

  getProviderDefinitionById: (providerId) => {
    return get().providerDefinitions.find(def => def.id === providerId)
  },

  getAccountById: (accountId) => {
    return get().accounts.find(account => account.id === accountId)
  },

  getAccountModel: (accountId, modelId) => {
    const account = get().accounts.find(item => item.id === accountId)
    return account?.models.find(model => model.id === modelId)
  },

  getProviderEntries: () => {
    const { accounts, providerDefinitions } = get()
    return buildProviderEntries(providerDefinitions, accounts)
  },

  resolveModelRef: (ref) => {
    if (!ref) return undefined
    const entry = get().getProviderEntries().find(item => item.account?.id === ref.accountId)
    const account = entry?.account
    if (!account) return undefined
    const model = account.models.find(item => item.id === ref.modelId)
    if (!model) return undefined
    return { account, model, definition: entry.definition }
  },

  getModelOptions: () => {
    return get().getProviderEntries().flatMap(entry =>
      (entry.account ? entry.models : [])
        .filter(model => model.enabled !== false)
        .map(model => ({
          account: entry.account!,
          model,
          definition: entry.definition
        }))
    )
  },

  addAccount: (account) => {
    const normalizedAccount = {
      ...account,
      providerId: normalizeProviderIdSafe(account.providerId)
    }
    set((state) => ({
      accounts: normalizeAccounts([normalizedAccount, ...state.accounts], normalizedAccount.id),
      currentAccountId: normalizedAccount.id,
      providersRevision: state.providersRevision + 1
    }))
    void persistProviderAccount(normalizedAccount)
  },

  addProviderWithAccount: async (definition, account) => {
    const normalizedProviderId = normalizeProviderIdSafe(definition.id || definition.displayName || '')
    const normalizedDefinition: ProviderDefinition = {
      ...definition,
      id: normalizedProviderId,
      displayName: definition.displayName?.trim() || normalizedProviderId
    }
    const normalizedAccount: ProviderAccount = {
      ...account,
      providerId: normalizedProviderId
    }

    try {
      const { saveProviderDefinition, saveProviderAccount } = await import('../db/ProviderRepository')
      await saveProviderDefinition(normalizedDefinition)
      await saveProviderAccount(normalizedAccount)
    } catch (error) {
      logger.error('provider_with_account.add_failed', error)
      toast.error('Failed to save provider')
      return
    }

    set((state) => ({
      providerDefinitions: normalizeProviderDefinitions([normalizedDefinition, ...state.providerDefinitions]),
      accounts: normalizeAccounts([normalizedAccount, ...state.accounts], normalizedAccount.id),
      currentAccountId: normalizedAccount.id,
      providersRevision: state.providersRevision + 1
    }))
  },

  updateAccount: (accountId, updates) => {
    let updatedAccount: ProviderAccount | undefined
    set((state) => {
      const nextAccounts = state.accounts.map(account => {
        if (account.id !== accountId) return account
        const nextProviderId = updates.providerId
          ? normalizeProviderIdSafe(updates.providerId)
          : account.providerId
        updatedAccount = { ...account, ...updates, providerId: nextProviderId }
        return updatedAccount
      })
      return {
        accounts: normalizeAccounts(nextAccounts, accountId),
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      void persistProviderAccount(updatedAccount)
    }
  },

  removeAccount: (accountId) => {
    set((state) => {
      const nextAccounts = state.accounts.filter(account => account.id !== accountId)
      const shouldClearDefaultModel = state.defaultModel?.accountId === accountId
      const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId

      return {
        accounts: nextAccounts,
        currentAccountId: state.currentAccountId === accountId ? undefined : state.currentAccountId,
        defaultModel: shouldClearDefaultModel ? undefined : state.defaultModel,
        titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel,
        providersRevision: state.providersRevision + 1
      }
    })
    void removeProviderAccount(accountId)
  },

  addModel: (accountId, model) => {
    let updatedAccount: ProviderAccount | undefined
    set((state) => {
      const nextAccounts = state.accounts.map(account =>
        account.id === accountId
          ? { ...account, models: [...account.models, model] }
          : account
      )
      updatedAccount = nextAccounts.find(account => account.id === accountId)
      return {
        accounts: nextAccounts,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      void persistProviderModel(accountId, model)
    }
  },

  updateModel: (accountId, modelId, updates) => {
    let updatedAccount: ProviderAccount | undefined
    let nextModel: AccountModel | undefined
    set((state) => {
      const nextAccounts = state.accounts.map(account =>
        account.id === accountId
          ? {
            ...account,
            models: account.models.map(model =>
              model.id === modelId
                ? (() => {
                  nextModel = { ...model, ...updates }
                  return nextModel
                })()
                : model
            )
          }
          : account
      )
      updatedAccount = nextAccounts.find(account => account.id === accountId)
      return {
        accounts: nextAccounts,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount && nextModel) {
      void persistProviderModel(accountId, nextModel)
    }
  },

  removeModel: (accountId, modelId) => {
    let updatedAccount: ProviderAccount | undefined
    set((state) => {
      const shouldClearDefaultModel = state.defaultModel?.accountId === accountId
        && state.defaultModel?.modelId === modelId
      const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId
        && state.titleGenerateModel?.modelId === modelId

      const nextAccounts = state.accounts.map(account =>
        account.id === accountId
          ? { ...account, models: account.models.filter(model => model.id !== modelId) }
          : account
      )
      updatedAccount = nextAccounts.find(account => account.id === accountId)

      return {
        accounts: nextAccounts,
        defaultModel: shouldClearDefaultModel ? undefined : state.defaultModel,
        titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      void removeProviderModel(accountId, modelId)
    }
  },

  toggleModelEnabled: (accountId, modelId) => {
    let updatedAccount: ProviderAccount | undefined
    let nextEnabled = true
    set((state) => {
      const shouldClearDefaultModel = state.defaultModel?.accountId === accountId
        && state.defaultModel?.modelId === modelId
      const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId
        && state.titleGenerateModel?.modelId === modelId

      const nextAccounts = state.accounts.map(account =>
        account.id === accountId
          ? {
            ...account,
            models: account.models.map(model =>
              model.id === modelId
                ? (() => {
                  nextEnabled = model.enabled === false
                  return { ...model, enabled: nextEnabled }
                })()
                : model
            )
          }
          : account
      )
      updatedAccount = nextAccounts.find(account => account.id === accountId)

      return {
        accounts: nextAccounts,
        defaultModel: shouldClearDefaultModel && !nextEnabled ? undefined : state.defaultModel,
        titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      void setProviderModelEnabled(accountId, modelId, nextEnabled)
    }
  },

  // Tool setting actions
  setDefaultModel: (modelRef) => set({ defaultModel: modelRef }),
  setTitleGenerateModel: (modelRef) => set({ titleGenerateModel: modelRef }),
  setTitleGenerateEnabled: (state) => set({ titleGenerateEnabled: state }),
  setMemoryEnabled: (state) => set({ memoryEnabled: state }),
  setStreamChunkDebugEnabled: (state) => set({ streamChunkDebugEnabled: state }),
  setMcpServerConfig: (config) => set({ mcpServerConfig: config }),
  saveMcpServerConfig: async (config) => {
    const { saveMcpServerConfig } = await import('../db/McpServerRepository')
    const nextConfig = config?.mcpServers && typeof config.mcpServers === 'object'
      ? config
      : { mcpServers: {} }
    await saveMcpServerConfig(nextConfig)
    set({
      mcpServerConfig: nextConfig,
      savedMcpServerConfig: nextConfig,
      mcpConfigLoaded: true
    })
  },
  setPlugins: (plugins) => set({ plugins }),
  savePlugins: async (plugins) => {
    const { savePluginConfigs, getPlugins } = await import('../db/PluginRepository')
    await savePluginConfigs(plugins.map(plugin => ({
      id: plugin.pluginId,
      name: plugin.name,
      description: plugin.description,
      enabled: plugin.enabled,
      source: plugin.source,
      version: plugin.version,
      manifestPath: plugin.manifestPath
    })))
    const nextPlugins = await getPlugins()
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  },
  refreshPlugins: async () => {
    const { rescanLocalPlugins } = await import('../db/PluginRepository')
    const nextPlugins = await rescanLocalPlugins()
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  },
  refreshRemotePlugins: async () => {
    const { getRemotePlugins } = await import('../db/PluginRepository')
    const nextRemotePlugins = await getRemotePlugins()
    set({
      remotePlugins: nextRemotePlugins,
      remotePluginsLoaded: true
    })
  },
  installRemotePlugin: async (pluginId) => {
    const { installRemotePlugin, getRemotePlugins } = await import('../db/PluginRepository')
    const [nextPlugins, nextRemotePlugins] = await Promise.all([
      installRemotePlugin(pluginId),
      getRemotePlugins().catch((error) => {
        logger.warn('remote_plugins.refresh_after_install_failed', {
          pluginId,
          error: error instanceof Error ? error.message : String(error)
        })
        return get().remotePlugins
      })
    ])
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true,
      remotePlugins: nextRemotePlugins,
      remotePluginsLoaded: true
    })
  },
  importLocalPlugin: async (sourceDir) => {
    const { importLocalPlugin } = await import('../db/PluginRepository')
    const nextPlugins = await importLocalPlugin(sourceDir)
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  },
  uninstallLocalPlugin: async (pluginId) => {
    const { uninstallLocalPlugin } = await import('../db/PluginRepository')
    const nextPlugins = await uninstallLocalPlugin(pluginId)
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  }
}))

// Async initialization function
export const initializeAppConfig = async (): Promise<void> => {
  if (configInitialized) return
  if (configInitPromise) return configInitPromise

  configInitPromise = (async () => {
    try {
      const { initConfig } = await import('../db/ConfigRepository')
      const loadedConfig = await initConfig()
      logger.info('config.loaded_from_sqlite', {
        accountCount: loadedConfig.accounts?.length || 0
      })
      const store = useAppConfigStore.getState()
      store._setAppConfig(loadedConfig)
      if (!configEventsSubscribed || !pluginEventsSubscribed) {
        const { subscribeConfigEvents, subscribePluginEvents } = await import('../invoker/ipcInvoker')
        if (!configEventsSubscribed) {
          subscribeConfigEvents((event) => {
            if (event.type !== 'updated') return
            void useAppConfigStore.getState().refreshAppConfig()
          })
          configEventsSubscribed = true
        }
        if (!pluginEventsSubscribed) {
          subscribePluginEvents((event) => {
            if (event.type !== 'updated') return
            useAppConfigStore.getState()._setLoadedPlugins(event.payload.plugins)
          })
          pluginEventsSubscribed = true
        }
      }
      configInitialized = true
      logger.info('config.bootstrap_completed')
    } catch (error) {
      logger.error('config.initialize_failed', error)
      configInitialized = true
    }
  })()

  return configInitPromise
}

let deferredHydrationStarted = false
let deferredHydrationPromise: Promise<void> | null = null

export const hydrateDeferredAppConfig = async (): Promise<void> => {
  if (deferredHydrationStarted) {
    return deferredHydrationPromise ?? Promise.resolve()
  }

  deferredHydrationStarted = true
  deferredHydrationPromise = Promise.allSettled([
    (async () => {
      const store = useAppConfigStore.getState()
      try {
        logger.info('config.hydrate_mcp.started')
        const { getMcpServerConfig } = await import('../db/McpServerRepository')
        const loadedMcpServerConfig = await getMcpServerConfig()
        store._setLoadedMcpServerConfig(loadedMcpServerConfig)
        logger.info('config.hydrate_mcp.completed', {
          count: Object.keys(loadedMcpServerConfig?.mcpServers || {}).length
        })
      } catch (error) {
        useAppConfigStore.setState({ mcpConfigLoaded: true })
        logger.warn('config.hydrate_mcp.failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })(),
    (async () => {
      const store = useAppConfigStore.getState()
      try {
        logger.info('config.hydrate_plugins.started')
        const { getPlugins } = await import('../db/PluginRepository')
        const loadedPlugins = await getPlugins()
        store._setLoadedPlugins(loadedPlugins)
        logger.info('config.hydrate_plugins.completed', {
          count: loadedPlugins.length
        })
      } catch (error) {
        useAppConfigStore.setState({ pluginsLoaded: true })
        logger.warn('config.hydrate_plugins.failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })(),
    (async () => {
      const store = useAppConfigStore.getState()
      try {
        logger.info('config.hydrate_remote_plugins.started')
        const { getRemotePlugins } = await import('../db/PluginRepository')
        const loadedRemotePlugins = await getRemotePlugins()
        store._setLoadedRemotePlugins(loadedRemotePlugins)
        logger.info('config.hydrate_remote_plugins.completed', {
          count: loadedRemotePlugins.length
        })
      } catch (error) {
        useAppConfigStore.setState({ remotePluginsLoaded: true })
        logger.warn('config.hydrate_remote_plugins.failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    })()
  ]).then(() => undefined)

  return deferredHydrationPromise
}

// Export type
class Wrapper {
  f() {
    return useAppConfigStore();
  }
}
export type AppConfigStore = ReturnType<Wrapper["f"]>;
