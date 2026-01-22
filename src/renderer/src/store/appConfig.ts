import { create } from 'zustand'
import { toast } from 'sonner'
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
    console.error('[appConfig] Failed to persist provider definitions:', error)
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
    console.error('[appConfig] Failed to persist provider accounts:', error)
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
    console.error('[appConfig] Failed to persist provider account:', error)
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
    console.error('[appConfig] Failed to delete provider account:', error)
  }
}

const persistProviderModel = async (accountId: string, model: AccountModel): Promise<void> => {
  try {
    const { saveProviderModel } = await import('../db/ProviderRepository')
    await saveProviderModel(accountId, model)
  } catch (error) {
    console.error('[appConfig] Failed to persist provider model:', error)
  }
}

const removeProviderModel = async (accountId: string, modelId: string): Promise<void> => {
  try {
    const { deleteProviderModel } = await import('../db/ProviderRepository')
    await deleteProviderModel(accountId, modelId)
  } catch (error) {
    console.error('[appConfig] Failed to delete provider model:', error)
  }
}

const setProviderModelEnabled = async (accountId: string, modelId: string, enabled: boolean): Promise<void> => {
  try {
    const { setProviderModelEnabled } = await import('../db/ProviderRepository')
    await setProviderModelEnabled(accountId, modelId, enabled)
  } catch (error) {
    console.error('[appConfig] Failed to set provider model enabled:', error)
  }
}

type AppConfigState = {
  appConfig: IAppConfig
  providerDefinitions: ProviderDefinition[]
  accounts: ProviderAccount[]
  providersRevision: number
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
  addProviderWithAccount: (definition: ProviderDefinition, account: ProviderAccount) => Promise<void>
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
  providersRevision: 0,
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
      titleGenerateModel: nextConfig.tools?.titleGenerateModel || undefined,
      titleGenerateEnabled: nextConfig.tools?.titleGenerateEnabled ?? true,
      memoryEnabled: nextConfig.tools?.memoryEnabled ?? true,
      mcpServerConfig: { ...nextConfig.mcp },
      compression: nextConfig.compression
    })
  },

  // Getter
  getAppConfig: () => get().appConfig,

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
      console.error('[appConfig] Failed to add provider with account:', error)
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
      const shouldClearTitleModel = state.titleGenerateModel?.accountId === accountId

      return {
        accounts: nextAccounts,
        currentAccountId: state.currentAccountId === accountId ? undefined : state.currentAccountId,
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
        titleGenerateModel: shouldClearTitleModel ? undefined : state.titleGenerateModel,
        providersRevision: state.providersRevision + 1
      }
    })
    if (updatedAccount) {
      void setProviderModelEnabled(accountId, modelId, nextEnabled)
    }
  },

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
