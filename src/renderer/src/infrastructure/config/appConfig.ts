import { create } from 'zustand'
import { toast } from 'sonner'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import type { RemotePluginCatalogItem } from '@shared/plugins/remoteRegistry'
import {
  isModelRefAvailable,
  isVisionModelRefAvailable,
  normalizeAppConfigModelSlots
} from '@shared/services/ChatModelResolver'
import { defaultConfig } from '@renderer/shared/config'
import type { ModelOption } from '@renderer/shared/config/modelTypes'
import { getConfig, initConfig, saveConfig } from '@renderer/infrastructure/persistence/ConfigRepository'
import { subscribeConfigEvents, subscribePluginEvents } from '@renderer/infrastructure/ipc'

// Initialization tracking
let configInitialized = false
let configInitPromise: Promise<void> | null = null
let configEventsSubscribed = false
let pluginEventsSubscribed = false
let remotePluginsRefreshPromise: Promise<RemotePluginCatalogItem[]> | null = null
const logger = createRendererLogger('AppConfigStore')

export type { ModelOption } from '@renderer/shared/config/modelTypes'

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

const serializeProviderAccountForPersistence = (account: ProviderAccount): string => {
  return JSON.stringify({
    id: account.id,
    providerId: account.providerId,
    label: account.label,
    apiUrl: account.apiUrl,
    apiKey: account.apiKey,
    models: account.models
  })
}

const hasProviderAccountChanged = (
  previous: ProviderAccount | undefined,
  next: ProviderAccount
): boolean => {
  if (!previous) {
    return true
  }

  return serializeProviderAccountForPersistence(previous) !== serializeProviderAccountForPersistence(next)
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
    const { saveProviderDefinition, deleteProviderDefinition } = await import('@renderer/infrastructure/persistence/ProviderRepository')
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
    const { saveProviderAccount, deleteProviderAccount } = await import('@renderer/infrastructure/persistence/ProviderRepository')
    const prevIds = new Set(previous.map(account => account.id))
    const previousById = new Map(previous.map(account => [account.id, account]))
    const nextIds = new Set(next.map(account => account.id))
    const removed = Array.from(prevIds).filter(id => !nextIds.has(id))
    const changed = next.filter(account => hasProviderAccountChanged(previousById.get(account.id), account))

    await Promise.all(removed.map(id => deleteProviderAccount(id)))
    await Promise.all(changed.map(account => saveProviderAccount(account)))
  } catch (error) {
    logger.error('provider_accounts.persist_failed', error)
    if (error instanceof Error && error.message.includes('Provider not found')) {
      toast.error('Provider not found. Please select a valid provider before saving.')
    }
  }
}

const persistProviderAccount = async (account: ProviderAccount): Promise<void> => {
  try {
    const { saveProviderAccount } = await import('@renderer/infrastructure/persistence/ProviderRepository')
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
    const { deleteProviderAccount } = await import('@renderer/infrastructure/persistence/ProviderRepository')
    await deleteProviderAccount(accountId)
  } catch (error) {
    logger.error('provider_account.delete_failed', error)
  }
}

const persistProviderModel = async (accountId: string, model: AccountModel): Promise<void> => {
  try {
    const { saveProviderModel } = await import('@renderer/infrastructure/persistence/ProviderRepository')
    await saveProviderModel(accountId, model)
  } catch (error) {
    logger.error('provider_model.persist_failed', error)
  }
}

const removeProviderModel = async (accountId: string, modelId: string): Promise<void> => {
  try {
    const { deleteProviderModel } = await import('@renderer/infrastructure/persistence/ProviderRepository')
    await deleteProviderModel(accountId, modelId)
  } catch (error) {
    logger.error('provider_model.delete_failed', error)
  }
}

const setProviderModelEnabled = async (accountId: string, modelId: string, enabled: boolean): Promise<void> => {
  try {
    const { setProviderModelEnabled } = await import('@renderer/infrastructure/persistence/ProviderRepository')
    await setProviderModelEnabled(accountId, modelId, enabled)
  } catch (error) {
    logger.error('provider_model.set_enabled_failed', error)
  }
}

type ModelSlotCleanupState = {
  appConfig: IAppConfig
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
  mainModel: ModelRef | undefined
  liteModel: ModelRef | undefined
  visionModel: ModelRef | undefined
}

type ModelSlotCleanupResult = {
  appConfig: IAppConfig
  mainModel: ModelRef | undefined
  liteModel: ModelRef | undefined
  visionModel: ModelRef | undefined
  changed: boolean
}

const areModelRefsEqual = (left: ModelRef | undefined, right: ModelRef | undefined): boolean => {
  return left?.accountId === right?.accountId && left?.modelId === right?.modelId
}

const stripProviderStateForConfigPersistence = (config: IAppConfig): IAppConfig => {
  const { providerDefinitions: _definitions, accounts: _accounts, ...baseConfig } = config
  return baseConfig
}

const hasEnabledProviderDefinitionForRef = (
  config: IAppConfig,
  ref: ModelRef | undefined
): boolean => {
  const account = config.accounts?.find(item => item.id === ref?.accountId)
  if (!account) {
    return false
  }

  const definition = config.providerDefinitions?.find(item => item.id === account.providerId)
  return Boolean(definition && definition.enabled !== false)
}

const isModelSlotAvailable = (config: IAppConfig, ref: ModelRef | undefined): boolean => {
  return hasEnabledProviderDefinitionForRef(config, ref) && isModelRefAvailable(config, ref)
}

const isVisionModelSlotAvailable = (config: IAppConfig, ref: ModelRef | undefined): boolean => {
  return hasEnabledProviderDefinitionForRef(config, ref) && isVisionModelRefAvailable(config, ref)
}

const cleanupModelSlotsForProviderState = (
  state: ModelSlotCleanupState,
  providerDefinitions: ProviderDefinition[] = state.providerDefinitions,
  accounts: ProviderAccount[] = state.accounts
): ModelSlotCleanupResult => {
  const currentTools = state.appConfig.tools ?? {}
  const candidateTools = {
    ...currentTools,
    mainModel: state.mainModel,
    liteModel: state.liteModel,
    visionModel: state.visionModel
  }
  const availabilityConfig: IAppConfig = {
    ...state.appConfig,
    providerDefinitions,
    accounts,
    tools: candidateTools
  }
  const mainModel = isModelSlotAvailable(availabilityConfig, state.mainModel)
    ? state.mainModel
    : undefined
  const liteModel = isModelSlotAvailable(availabilityConfig, state.liteModel)
    ? state.liteModel
    : undefined
  const visionModel = isVisionModelSlotAvailable(availabilityConfig, state.visionModel)
    ? state.visionModel
    : undefined
  const nextTools = {
    ...currentTools,
    mainModel,
    liteModel,
    visionModel
  }
  const changed = !areModelRefsEqual(state.mainModel, mainModel)
    || !areModelRefsEqual(state.liteModel, liteModel)
    || !areModelRefsEqual(state.visionModel, visionModel)
    || !areModelRefsEqual(currentTools.mainModel, mainModel)
    || !areModelRefsEqual(currentTools.liteModel, liteModel)
    || !areModelRefsEqual(currentTools.visionModel, visionModel)

  return {
    appConfig: changed
      ? {
        ...state.appConfig,
        tools: nextTools
      }
      : state.appConfig,
    mainModel,
    liteModel,
    visionModel,
    changed
  }
}

const persistAppConfigModelSlotCleanup = async (config?: IAppConfig): Promise<void> => {
  if (!config) {
    return
  }

  try {
    await saveConfig(stripProviderStateForConfigPersistence(config))
  } catch (error) {
    logger.error('provider_model_slots.cleanup_persist_failed', error)
  }
}

const persistAfterModelSlotCleanup = (
  cleanupConfig: IAppConfig | undefined,
  persist: () => Promise<void>
): void => {
  void (async () => {
    await persistAppConfigModelSlotCleanup(cleanupConfig)
    await persist()
  })()
}

type AppConfigState = {
  appVersion: string
  appConfig: IAppConfig
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
  providersRevision: number
  currentAccountId: string | undefined
  mainModel: ModelRef | undefined
  liteModel: ModelRef | undefined
  visionModel: ModelRef | undefined
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
  knowledgebase: KnowledgebaseConfig | undefined
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

  setMainModel: (modelRef: ModelRef | undefined) => void
  setLiteModel: (modelRef: ModelRef | undefined) => void
  setVisionModel: (modelRef: ModelRef | undefined) => void
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

const appVersion = typeof __APP_VERSION__ === 'undefined' ? 'development' : __APP_VERSION__

export const useAppConfigStore = create<AppConfigState & AppConfigAction>((set, get) => ({
  appVersion,
  // State - Config
  appConfig: defaultConfig,
  providerDefinitions: defaultConfig.providerDefinitions || [],
  accounts: defaultConfig.accounts || [],
  providersRevision: 0,
  currentAccountId: undefined,
  mainModel: defaultConfig.tools?.mainModel || undefined,

  // State - Tool settings
  liteModel: defaultConfig.tools?.liteModel || undefined,
  visionModel: defaultConfig.tools?.visionModel || undefined,
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
  knowledgebase: defaultConfig.knowledgebase,

  // State - Compression settings
  compression: defaultConfig.compression,

  // Internal setter (used by initializeAppConfig)
  _setAppConfig: (config: IAppConfig) => {
    const normalizedConfig = normalizeAppConfigModelSlots(config)
    const nextProviderDefinitions = normalizeProviderDefinitions(
      normalizedConfig.providerDefinitions || []
    )
    const nextAccounts = normalizeAccounts(normalizedConfig.accounts || [])
    const nextKnowledgebase = normalizedConfig.knowledgebase ?? defaultConfig.knowledgebase

    set({
      appConfig: {
        ...normalizedConfig,
        knowledgebase: nextKnowledgebase,
        providerDefinitions: nextProviderDefinitions,
        accounts: nextAccounts
      },
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts,
      providersRevision: 0,
      mainModel: normalizedConfig.tools?.mainModel || undefined,
      liteModel: normalizedConfig.tools?.liteModel || undefined,
      visionModel: normalizedConfig.tools?.visionModel || undefined,
      memoryEnabled: normalizedConfig.tools?.memoryEnabled ?? true,
      streamChunkDebugEnabled: normalizedConfig.tools?.streamChunkDebugEnabled ?? false,
      knowledgebase: nextKnowledgebase,
      compression: normalizedConfig.compression
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
    const normalizedUpdatedConfig = normalizeAppConfigModelSlots(updatedConfig)
    const nextProviderDefinitions = normalizeProviderDefinitions(
      normalizedUpdatedConfig.providerDefinitions || []
    )
    const nextAccounts = normalizeAccounts(normalizedUpdatedConfig.accounts || [])

    const nextConfig = {
      ...normalizedUpdatedConfig,
      knowledgebase: normalizedUpdatedConfig.knowledgebase ?? defaultConfig.knowledgebase,
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
      mainModel: nextConfig.tools?.mainModel || undefined,
      liteModel: nextConfig.tools?.liteModel || undefined,
      visionModel: nextConfig.tools?.visionModel || undefined,
      memoryEnabled: nextConfig.tools?.memoryEnabled ?? true,
      streamChunkDebugEnabled: nextConfig.tools?.streamChunkDebugEnabled ?? false,
      knowledgebase: nextConfig.knowledgebase,
      compression: nextConfig.compression
    })
  },

  refreshAppConfig: async () => {
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
    let cleanupConfigToPersist: IAppConfig | undefined
    set((state) => ({
      ...(() => {
        const nextAccounts = normalizeAccounts(state.accounts)
        const cleanup = cleanupModelSlotsForProviderState(state, nextDefinitions, nextAccounts)
        cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined
        return {
          appConfig: cleanup.appConfig,
          providerDefinitions: nextDefinitions,
          accounts: nextAccounts,
          mainModel: cleanup.mainModel,
          liteModel: cleanup.liteModel,
          visionModel: cleanup.visionModel,
          providersRevision: state.providersRevision + 1
        }
      })()
    }))
    persistAfterModelSlotCleanup(
      cleanupConfigToPersist,
      () => persistProviderDefinitions(prevDefinitions, nextDefinitions)
    )
  },
  setAccounts: (accounts) => {
    const prevAccounts = get().accounts
    const nextAccounts = normalizeAccounts(accounts)
    let cleanupConfigToPersist: IAppConfig | undefined
    set((state) => ({
      ...(() => {
        const cleanup = cleanupModelSlotsForProviderState(state, state.providerDefinitions, nextAccounts)
        cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined
        return {
          appConfig: cleanup.appConfig,
          accounts: nextAccounts,
          mainModel: cleanup.mainModel,
          liteModel: cleanup.liteModel,
          visionModel: cleanup.visionModel,
          providersRevision: state.providersRevision + 1
        }
      })()
    }))
    persistAfterModelSlotCleanup(
      cleanupConfigToPersist,
      () => persistProviderAccounts(prevAccounts, nextAccounts)
    )
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
    if (entry?.definition.enabled === false) return undefined
    if (!account) return undefined
    const model = account.models.find(item => item.id === ref.modelId && item.enabled !== false)
    if (!model) return undefined
    return { account, model, definition: entry.definition }
  },

  getModelOptions: () => {
    return get().getProviderEntries().flatMap(entry =>
      (entry.account && entry.definition.enabled !== false ? entry.models : [])
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
      const { saveProviderDefinition, saveProviderAccount } = await import('@renderer/infrastructure/persistence/ProviderRepository')
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
    let cleanupConfigToPersist: IAppConfig | undefined
    set((state) => {
      const nextAccounts = state.accounts.filter(account => account.id !== accountId)
      const cleanup = cleanupModelSlotsForProviderState(state, state.providerDefinitions, nextAccounts)
      cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined

      return {
        appConfig: cleanup.appConfig,
        accounts: nextAccounts,
        currentAccountId: state.currentAccountId === accountId ? undefined : state.currentAccountId,
        mainModel: cleanup.mainModel,
        liteModel: cleanup.liteModel,
        visionModel: cleanup.visionModel,
        providersRevision: state.providersRevision + 1
      }
    })
    persistAfterModelSlotCleanup(
      cleanupConfigToPersist,
      () => removeProviderAccount(accountId)
    )
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
    let cleanupConfigToPersist: IAppConfig | undefined
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
      const cleanup = cleanupModelSlotsForProviderState(state, state.providerDefinitions, nextAccounts)
      cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined
      return {
        appConfig: cleanup.appConfig,
        accounts: nextAccounts,
        mainModel: cleanup.mainModel,
        liteModel: cleanup.liteModel,
        visionModel: cleanup.visionModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount && nextModel) {
      persistAfterModelSlotCleanup(
        cleanupConfigToPersist,
        () => persistProviderModel(accountId, nextModel!)
      )
    }
  },

  removeModel: (accountId, modelId) => {
    let updatedAccount: ProviderAccount | undefined
    let cleanupConfigToPersist: IAppConfig | undefined
    set((state) => {
      const nextAccounts = state.accounts.map(account =>
        account.id === accountId
          ? { ...account, models: account.models.filter(model => model.id !== modelId) }
          : account
      )
      updatedAccount = nextAccounts.find(account => account.id === accountId)
      const cleanup = cleanupModelSlotsForProviderState(state, state.providerDefinitions, nextAccounts)
      cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined

      return {
        appConfig: cleanup.appConfig,
        accounts: nextAccounts,
        mainModel: cleanup.mainModel,
        liteModel: cleanup.liteModel,
        visionModel: cleanup.visionModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      persistAfterModelSlotCleanup(
        cleanupConfigToPersist,
        () => removeProviderModel(accountId, modelId)
      )
    }
  },

  toggleModelEnabled: (accountId, modelId) => {
    let updatedAccount: ProviderAccount | undefined
    let nextEnabled = true
    let cleanupConfigToPersist: IAppConfig | undefined
    set((state) => {
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
      const cleanup = cleanupModelSlotsForProviderState(state, state.providerDefinitions, nextAccounts)
      cleanupConfigToPersist = cleanup.changed ? cleanup.appConfig : undefined

      return {
        appConfig: cleanup.appConfig,
        accounts: nextAccounts,
        mainModel: cleanup.mainModel,
        liteModel: cleanup.liteModel,
        visionModel: cleanup.visionModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      persistAfterModelSlotCleanup(
        cleanupConfigToPersist,
        () => setProviderModelEnabled(accountId, modelId, nextEnabled)
      )
    }
  },

  // Tool setting actions
  setMainModel: (modelRef) => set({ mainModel: modelRef }),
  setLiteModel: (modelRef) => set({ liteModel: modelRef }),
  setVisionModel: (modelRef) => set({ visionModel: modelRef }),
  setMemoryEnabled: (state) => set({ memoryEnabled: state }),
  setStreamChunkDebugEnabled: (state) => set({ streamChunkDebugEnabled: state }),
  setMcpServerConfig: (config) => set({ mcpServerConfig: config }),
  saveMcpServerConfig: async (config) => {
    const { saveMcpServerConfig } = await import('@renderer/infrastructure/persistence/McpServerRepository')
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
    const { savePluginConfigs, getPlugins } = await import('@renderer/infrastructure/persistence/PluginRepository')
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
    const { rescanLocalPlugins } = await import('@renderer/infrastructure/persistence/PluginRepository')
    const nextPlugins = await rescanLocalPlugins()
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  },
  refreshRemotePlugins: async () => {
    const { getRemotePlugins } = await import('@renderer/infrastructure/persistence/PluginRepository')
    remotePluginsRefreshPromise ??= getRemotePlugins().finally(() => {
      remotePluginsRefreshPromise = null
    })

    try {
      const nextRemotePlugins = await remotePluginsRefreshPromise
      set({
        remotePlugins: nextRemotePlugins,
        remotePluginsLoaded: true
      })
    } catch (error) {
      set({ remotePluginsLoaded: true })
      logger.warn('remote_plugins.refresh_failed', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },
  installRemotePlugin: async (pluginId) => {
    const { installRemotePlugin, getRemotePlugins } = await import('@renderer/infrastructure/persistence/PluginRepository')
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
    const { importLocalPlugin } = await import('@renderer/infrastructure/persistence/PluginRepository')
    const nextPlugins = await importLocalPlugin(sourceDir)
    set({
      plugins: nextPlugins,
      savedPlugins: nextPlugins,
      pluginsLoaded: true
    })
  },
  uninstallLocalPlugin: async (pluginId) => {
    const { uninstallLocalPlugin } = await import('@renderer/infrastructure/persistence/PluginRepository')
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
      const loadedConfig = await initConfig()
      logger.info('config.loaded_from_sqlite', {
        accountCount: loadedConfig.accounts?.length || 0
      })
      const store = useAppConfigStore.getState()
      store._setAppConfig(loadedConfig)
      if (!configEventsSubscribed || !pluginEventsSubscribed) {
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
        const { getMcpServerConfig } = await import('@renderer/infrastructure/persistence/McpServerRepository')
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
        const { getPlugins } = await import('@renderer/infrastructure/persistence/PluginRepository')
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
