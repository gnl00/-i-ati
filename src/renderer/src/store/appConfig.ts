import { create } from 'zustand'
import { defaultConfig } from '../config'

// Initialization tracking
let configInitialized = false
let configInitPromise: Promise<void> | null = null

export type ModelOption = {
  account: ProviderAccount
  model: AccountModel
  definition?: ProviderDefinition
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

const mergeProviderDefinitions = (
  current: ProviderDefinition[] = [],
  defaults: ProviderDefinition[] = []
): ProviderDefinition[] => {
  const normalizedCurrent = normalizeProviderDefinitions(current)
  const normalizedDefaults = normalizeProviderDefinitions(defaults)
  const currentById = new Map(normalizedCurrent.map(def => [def.id, def]))
  const merged: ProviderDefinition[] = []

  normalizedDefaults.forEach(def => {
    const override = currentById.get(def.id)
    merged.push(override ?? def)
    currentById.delete(def.id)
  })

  currentById.forEach(def => merged.push(def))
  return merged
}

type AppConfigState = {
  appConfig: IAppConfig
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
  currentAccountId: string | undefined
  titleGenerateModel: ModelRef | undefined
  titleGenerateEnabled: boolean
  memoryEnabled: boolean
  mcpServerConfig: { mcpServers?: {} }
  compression: CompressionConfig | undefined
}

type AppConfigAction = {
  _setAppConfig: (config: IAppConfig) => void
  setAppConfig: (config: IAppConfig) => Promise<void>
  getAppConfig: () => IAppConfig

  setProviderDefinitions: (definitions: ProviderDefinition[]) => void
  setAccounts: (accounts: ProviderAccount[]) => void
  setCurrentAccountId: (accountId: string | undefined) => void

  getProviderDefinitionById: (providerId: string) => ProviderDefinition | undefined
  getAccountById: (accountId: string) => ProviderAccount | undefined
  getAccountModel: (accountId: string, modelId: string) => AccountModel | undefined
  resolveModelRef: (ref?: ModelRef) => ModelOption | undefined
  getModelOptions: () => ModelOption[]

  addAccount: (account: ProviderAccount) => void
  updateAccount: (accountId: string, updates: Partial<ProviderAccount>) => void
  removeAccount: (accountId: string) => void

  addModel: (accountId: string, model: AccountModel) => void
  updateModel: (accountId: string, modelId: string, updates: Partial<AccountModel>) => void
  removeModel: (accountId: string, modelId: string) => void
  toggleModelEnabled: (accountId: string, modelId: string) => void

  setTitleGenerateModel: (modelRef: ModelRef | undefined) => void
  setTitleGenerateEnabled: (state: boolean) => void
  setMemoryEnabled: (state: boolean) => void
  setMcpServerConfig: (config: any) => void
}

export const useAppConfigStore = create<AppConfigState & AppConfigAction>((set, get) => ({
  // State - Config
  appConfig: defaultConfig,
  providerDefinitions: defaultConfig.providerDefinitions || [],
  accounts: defaultConfig.accounts || [],
  currentAccountId: undefined,

  // State - Tool settings
  titleGenerateModel: defaultConfig.tools?.titleGenerateModel || undefined,
  titleGenerateEnabled: defaultConfig.tools?.titleGenerateEnabled ?? true,
  memoryEnabled: defaultConfig.tools?.memoryEnabled ?? true,
  mcpServerConfig: { ...defaultConfig.mcp },

  // State - Compression settings
  compression: defaultConfig.compression,

  // Internal setter (used by initializeAppConfig)
  _setAppConfig: (config: IAppConfig) => {
    const nextProviderDefinitions = mergeProviderDefinitions(
      config.providerDefinitions || [],
      defaultConfig.providerDefinitions || []
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
      titleGenerateModel: config.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: config.tools?.titleGenerateEnabled ?? true,
      memoryEnabled: config.tools?.memoryEnabled ?? true,
      mcpServerConfig: { ...config.mcp },
      compression: config.compression
    })
  },

  // Public setter (saves to SQLite)
  setAppConfig: async (updatedConfig: IAppConfig) => {
    const { saveConfig } = await import('../db/ConfigRepository')
    const nextProviderDefinitions = mergeProviderDefinitions(
      updatedConfig.providerDefinitions || [],
      defaultConfig.providerDefinitions || []
    )
    const nextAccounts = normalizeAccounts(updatedConfig.accounts || [])

    const nextConfig = {
      ...updatedConfig,
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts
    }

    await saveConfig(nextConfig)
    set({
      appConfig: nextConfig,
      providerDefinitions: nextProviderDefinitions,
      accounts: nextAccounts,
      titleGenerateModel: nextConfig.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: nextConfig.tools?.titleGenerateEnabled ?? true,
      memoryEnabled: nextConfig.tools?.memoryEnabled ?? true,
      mcpServerConfig: { ...nextConfig.mcp },
      compression: nextConfig.compression
    })
  },

  // Getter
  getAppConfig: () => get().appConfig,

  setProviderDefinitions: (definitions) => set((state) => ({
    providerDefinitions: normalizeProviderDefinitions(definitions),
    accounts: normalizeAccounts(state.accounts)
  })),
  setAccounts: (accounts) => set({ accounts: normalizeAccounts(accounts) }),
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

  resolveModelRef: (ref) => {
    if (!ref) return undefined
    const account = get().accounts.find(item => item.id === ref.accountId)
    if (!account) return undefined
    const model = account.models.find(item => item.id === ref.modelId)
    if (!model) return undefined
    const definition = get().providerDefinitions.find(def => def.id === account.providerId)
    return { account, model, definition }
  },

  getModelOptions: () => {
    const { accounts, providerDefinitions } = get()
    return accounts.flatMap(account =>
      account.models
        .filter(model => model.enabled !== false)
        .map(model => ({
          account,
          model,
          definition: providerDefinitions.find(def => def.id === account.providerId)
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
      currentAccountId: normalizedAccount.id
    }))
  },

  updateAccount: (accountId, updates) => set((state) => {
    const nextAccounts = state.accounts.map(account => {
      if (account.id !== accountId) return account
      const nextProviderId = updates.providerId
        ? normalizeProviderIdSafe(updates.providerId)
        : account.providerId
      return { ...account, ...updates, providerId: nextProviderId }
    })
    return { accounts: normalizeAccounts(nextAccounts, accountId) }
  }),

  removeAccount: (accountId) => set((state) => {
    const nextAccounts = state.accounts.filter(account => account.id !== accountId)
    const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId

    return {
      accounts: nextAccounts,
      currentAccountId: state.currentAccountId === accountId ? undefined : state.currentAccountId,
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
    }
  }),

  addModel: (accountId, model) => set((state) => ({
    accounts: state.accounts.map(account =>
      account.id === accountId
        ? { ...account, models: [...account.models, model] }
        : account
    )
  })),

  updateModel: (accountId, modelId, updates) => set((state) => ({
    accounts: state.accounts.map(account =>
      account.id === accountId
        ? {
          ...account,
          models: account.models.map(model =>
            model.id === modelId ? { ...model, ...updates } : model
          )
        }
        : account
    )
  })),

  removeModel: (accountId, modelId) => set((state) => {
    const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId
      && state.titleGenerateModel?.modelId === modelId

    return {
      accounts: state.accounts.map(account =>
        account.id === accountId
          ? { ...account, models: account.models.filter(model => model.id !== modelId) }
          : account
      ),
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
    }
  }),

  toggleModelEnabled: (accountId, modelId) => set((state) => {
    const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId
      && state.titleGenerateModel?.modelId === modelId

    return {
      accounts: state.accounts.map(account =>
        account.id === accountId
          ? {
            ...account,
            models: account.models.map(model =>
              model.id === modelId ? { ...model, enabled: model.enabled === false } : model
            )
          }
          : account
      ),
      titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel
    }
  }),

  // Tool setting actions
  setTitleGenerateModel: (modelRef) => set({ titleGenerateModel: modelRef }),
  setTitleGenerateEnabled: (state) => set({ titleGenerateEnabled: state }),
  setMemoryEnabled: (state) => set({ memoryEnabled: state }),
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
      console.log('[appConfig] Config loaded from SQLite, account count:', loadedConfig.accounts?.length || 0)
      useAppConfigStore.getState()._setAppConfig(loadedConfig)
      configInitialized = true
      console.log('[@i] App config initialized from SQLite')
    } catch (error) {
      console.error('Failed to load config from SQLite:', error)
      configInitialized = true
    }
  })()

  return configInitPromise
}

// Export type
class Wrapper {
  f() {
    return useAppConfigStore();
  }
}
export type AppConfigStore = ReturnType<Wrapper["f"]>;
