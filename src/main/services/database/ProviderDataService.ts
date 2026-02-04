import type { ProviderRepository } from '@main/db/repositories/ProviderRepository'

type ProviderDataServiceDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/Database').AppDatabase['getDb']> | null
  getProviderRepo: () => ProviderRepository | undefined
}

export class ProviderDataService {
  constructor(private readonly deps: ProviderDataServiceDeps) {}

  getProviderDefinitions(): ProviderDefinition[] {
    const rows = this.requireProviderRepo().getProviderDefinitions()
    return rows.map(row => {
      let requestOverrides: Record<string, any> | undefined
      if (row.request_overrides) {
        try {
          requestOverrides = JSON.parse(row.request_overrides)
        } catch {
          requestOverrides = undefined
        }
      }
      return {
        id: row.id,
        displayName: row.display_name,
        adapterType: row.adapter_type as ProviderType,
        apiVersion: row.api_version ?? undefined,
        iconKey: row.icon_key ?? undefined,
        defaultApiUrl: row.default_api_url ?? undefined,
        requestOverrides
      }
    })
  }

  getProviderAccounts(): ProviderAccount[] {
    const providerRepo = this.requireProviderRepo()
    const accountRows = providerRepo.getProviderAccounts()
    const modelRows = providerRepo.getProviderModels()
    const modelsByAccount = new Map<string, AccountModel[]>()

    modelRows.forEach(row => {
      const models = modelsByAccount.get(row.account_id) || []
      models.push({
        id: row.model_id,
        label: row.label,
        type: row.type as ModelType,
        enabled: row.enabled === 1
      })
      modelsByAccount.set(row.account_id, models)
    })

    return accountRows.map(row => ({
      id: row.id,
      providerId: row.provider_id,
      label: row.label,
      apiUrl: row.api_url,
      apiKey: row.api_key,
      models: modelsByAccount.get(row.id) || []
    }))
  }

  countProviderDefinitions(): number {
    return this.requireProviderRepo().countProviderDefinitions()
  }

  ensureProviderDefinitions(definitions: ProviderDefinition[]): void {
    if (!definitions.length) return

    const normalized = this.normalizeProviderDefinitions(definitions).definitions
    const now = Date.now()
    const providerRepo = this.requireProviderRepo()
    const tx = this.requireDb().transaction(() => {
      normalized.forEach(def => {
        providerRepo.upsertProviderDefinition({
          id: def.id,
          display_name: def.displayName,
          adapter_type: def.adapterType,
          api_version: def.apiVersion ?? null,
          icon_key: def.iconKey ?? null,
          default_api_url: def.defaultApiUrl ?? null,
          request_overrides: def.requestOverrides ? JSON.stringify(def.requestOverrides) : null,
          created_at: now,
          updated_at: now
        })
      })
    })
    tx()
  }

  saveProviderDefinitionsToDb(definitions: ProviderDefinition[]): void {
    const db = this.requireDb()
    const providerRepo = this.requireProviderRepo()
    const normalized = this.normalizeProviderDefinitions(definitions).definitions
    const existingRows = providerRepo.getProviderDefinitions()
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(normalized.map(def => def.id))
    const now = Date.now()

    const tx = db.transaction(() => {
      normalized.forEach(def => {
        providerRepo.upsertProviderDefinition({
          id: def.id,
          display_name: def.displayName,
          adapter_type: def.adapterType,
          api_version: def.apiVersion ?? null,
          icon_key: def.iconKey ?? null,
          default_api_url: def.defaultApiUrl ?? null,
          request_overrides: def.requestOverrides ? JSON.stringify(def.requestOverrides) : null,
          created_at: now,
          updated_at: now
        })
      })

      existingIds.forEach(id => {
        if (incomingIds.has(id)) return
        const accountRows = db.prepare('SELECT id FROM provider_accounts WHERE provider_id = ?').all(id) as { id: string }[]
        accountRows.forEach(row => {
          providerRepo.deleteProviderModelsByAccountId(row.id)
        })
        providerRepo.deleteProviderAccountsByProviderId(id)
        providerRepo.deleteProviderDefinition(id)
      })
    })
    tx()
  }

  saveProviderAccountsToDb(accounts: ProviderAccount[]): void {
    const db = this.requireDb()
    const providerRepo = this.requireProviderRepo()
    const existingRows = providerRepo.getProviderAccounts()
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(accounts.map(account => account.id))
    const now = Date.now()

    const tx = db.transaction(() => {
      accounts.forEach(account => {
        this.assertProviderExists(account.providerId)
        providerRepo.upsertProviderAccount({
          id: account.id,
          provider_id: account.providerId,
          label: account.label,
          api_url: account.apiUrl,
          api_key: account.apiKey,
          created_at: now,
          updated_at: now
        })

        const models = account.models || []
        const existingModelRows = db.prepare('SELECT model_id FROM provider_models WHERE account_id = ?')
          .all(account.id) as { model_id: string }[]
        const existingModelIds = new Set(existingModelRows.map(row => row.model_id))
        const incomingModelIds = new Set(models.map(model => model.id))

        models.forEach(model => {
          providerRepo.upsertProviderModel({
            account_id: account.id,
            model_id: model.id,
            label: model.label,
            type: model.type,
            enabled: model.enabled ? 1 : 0,
            created_at: now,
            updated_at: now
          })
        })

        existingModelIds.forEach(modelId => {
          if (incomingModelIds.has(modelId)) return
          providerRepo.deleteProviderModel(account.id, modelId)
        })
      })

      existingIds.forEach(id => {
        if (incomingIds.has(id)) return
        providerRepo.deleteProviderModelsByAccountId(id)
        providerRepo.deleteProviderAccount(id)
      })
    })
    tx()
  }

  saveProviderDefinition(definition: ProviderDefinition): void {
    const normalized = this.normalizeProviderDefinitions([definition]).definitions[0]
    if (!normalized) return

    const now = Date.now()
    this.requireProviderRepo().upsertProviderDefinition({
      id: normalized.id,
      display_name: normalized.displayName,
      adapter_type: normalized.adapterType,
      api_version: normalized.apiVersion ?? null,
      icon_key: normalized.iconKey ?? null,
      default_api_url: normalized.defaultApiUrl ?? null,
      request_overrides: normalized.requestOverrides ? JSON.stringify(normalized.requestOverrides) : null,
      created_at: now,
      updated_at: now
    })
  }

  deleteProviderDefinition(providerId: string): void {
    if (!providerId) return

    const db = this.requireDb()
    const providerRepo = this.requireProviderRepo()
    const accountRows = db.prepare('SELECT id FROM provider_accounts WHERE provider_id = ?')
      .all(providerId) as { id: string }[]

    accountRows.forEach(row => {
      providerRepo.deleteProviderModelsByAccountId(row.id)
    })

    providerRepo.deleteProviderAccountsByProviderId(providerId)
    providerRepo.deleteProviderDefinition(providerId)
  }

  saveProviderAccount(account: ProviderAccount): void {
    if (!account?.id) return

    this.assertProviderExists(account.providerId)
    const db = this.requireDb()
    const providerRepo = this.requireProviderRepo()
    const now = Date.now()

    const tx = db.transaction(() => {
      providerRepo.upsertProviderAccount({
        id: account.id,
        provider_id: account.providerId,
        label: account.label,
        api_url: account.apiUrl,
        api_key: account.apiKey,
        created_at: now,
        updated_at: now
      })

      const models = account.models || []
      const existingRows = db.prepare('SELECT model_id FROM provider_models WHERE account_id = ?')
        .all(account.id) as { model_id: string }[]
      const existingIds = new Set(existingRows.map(row => row.model_id))
      const incomingIds = new Set(models.map(model => model.id))

      models.forEach(model => {
        providerRepo.upsertProviderModel({
          account_id: account.id,
          model_id: model.id,
          label: model.label,
          type: model.type,
          enabled: model.enabled ? 1 : 0,
          created_at: now,
          updated_at: now
        })
      })

      existingIds.forEach(modelId => {
        if (incomingIds.has(modelId)) return
        providerRepo.deleteProviderModel(account.id, modelId)
      })
    })

    tx()
  }

  deleteProviderAccount(accountId: string): void {
    if (!accountId) return
    const providerRepo = this.requireProviderRepo()
    providerRepo.deleteProviderModelsByAccountId(accountId)
    providerRepo.deleteProviderAccount(accountId)
  }

  saveProviderModel(accountId: string, model: AccountModel): void {
    if (!accountId || !model?.id) return
    const now = Date.now()
    this.requireProviderRepo().upsertProviderModel({
      account_id: accountId,
      model_id: model.id,
      label: model.label,
      type: model.type,
      enabled: model.enabled ? 1 : 0,
      created_at: now,
      updated_at: now
    })
  }

  deleteProviderModel(accountId: string, modelId: string): void {
    if (!accountId || !modelId) return
    this.requireProviderRepo().deleteProviderModel(accountId, modelId)
  }

  setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    if (!accountId || !modelId) return
    this.requireProviderRepo().updateProviderModelEnabled(accountId, modelId, enabled ? 1 : 0)
  }

  private normalizeProviderId(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-')
  }

  private normalizeProviderDefinitions(
    definitions: ProviderDefinition[]
  ): { definitions: ProviderDefinition[]; changed: boolean } {
    const byId = new Map<string, ProviderDefinition>()
    let changed = false

    definitions.forEach(def => {
      const normalizedId = this.normalizeProviderId(def.id || def.displayName || '')
      if (!normalizedId) {
        return
      }
      const nextDef = normalizedId === def.id ? def : { ...def, id: normalizedId }
      if (normalizedId !== def.id) {
        changed = true
      }
      if (byId.has(normalizedId)) {
        changed = true
        return
      }
      byId.set(normalizedId, nextDef)
    })

    return { definitions: Array.from(byId.values()), changed }
  }

  private assertProviderExists(providerId: string): void {
    if (!providerId) {
      throw new Error('ProviderId is required')
    }
    const row = this.requireProviderRepo().getProviderDefinitionById(providerId)
    if (!row) {
      throw new Error(`Provider not found for providerId: ${providerId}`)
    }
  }

  private requireDb() {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requireProviderRepo(): ProviderRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getProviderRepo()
    if (!repo) throw new Error('Provider repository not initialized')
    return repo
  }
}
