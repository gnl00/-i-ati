import type { ProviderDao } from '@main/db/dao/ProviderDao'
import {
  toAccountModelEntity,
  toProviderAccountEntity,
  toProviderAccountRow,
  toProviderDefinitionEntity,
  toProviderDefinitionRow,
  toProviderModelRow
} from '@main/db/mappers/ProviderMapper'

type ProviderRepositoryDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  getProviderRepo: () => ProviderDao | undefined
}

export class ProviderRepository {
  constructor(private readonly deps: ProviderRepositoryDeps) {}

  getProviderDefinitions(): ProviderDefinition[] {
    const rows = this.requireProviderRepo().getProviderDefinitions()
    return rows.map(toProviderDefinitionEntity)
  }

  getProviderAccounts(): ProviderAccount[] {
    const providerRepo = this.requireProviderRepo()
    const accountRows = providerRepo.getProviderAccounts()
    const modelRows = providerRepo.getProviderModels()
    const modelsByAccount = new Map<string, AccountModel[]>()

    modelRows.forEach(row => {
      const models = modelsByAccount.get(row.account_id) || []
      models.push(toAccountModelEntity(row))
      modelsByAccount.set(row.account_id, models)
    })

    return accountRows.map(row => toProviderAccountEntity(row, modelsByAccount.get(row.id) || []))
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
        providerRepo.upsertProviderDefinition(toProviderDefinitionRow(def, now))
      })
    })
    tx()
  }

  saveProviderDefinitionsToDb(definitions: ProviderDefinition[]): void {
    const providerRepo = this.requireProviderRepo()
    const normalized = this.normalizeProviderDefinitions(definitions).definitions
    const existingRows = providerRepo.getProviderDefinitions()
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(normalized.map(def => def.id))
    const now = Date.now()

    const tx = this.requireDb().transaction(() => {
      normalized.forEach(def => {
        providerRepo.upsertProviderDefinition(toProviderDefinitionRow(def, now))
      })

      existingIds.forEach(id => {
        if (incomingIds.has(id)) return
        providerRepo.getProviderAccountIdsByProviderId(id).forEach(accountId => {
          providerRepo.deleteProviderModelsByAccountId(accountId)
        })
        providerRepo.deleteProviderAccountsByProviderId(id)
        providerRepo.deleteProviderDefinition(id)
      })
    })
    tx()
  }

  saveProviderAccountsToDb(accounts: ProviderAccount[]): void {
    const providerRepo = this.requireProviderRepo()
    const existingRows = providerRepo.getProviderAccounts()
    const existingIds = new Set(existingRows.map(row => row.id))
    const incomingIds = new Set(accounts.map(account => account.id))
    const now = Date.now()

    const tx = this.requireDb().transaction(() => {
      accounts.forEach(account => {
        this.assertProviderExists(account.providerId)
        providerRepo.upsertProviderAccount(toProviderAccountRow(account, now))

        const models = account.models || []
        const existingModelIds = new Set(providerRepo.getProviderModelIdsByAccountId(account.id))
        const incomingModelIds = new Set(models.map(model => model.id))

        models.forEach(model => {
          providerRepo.upsertProviderModel(toProviderModelRow(account.id, model, now))
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

    this.requireProviderRepo().upsertProviderDefinition(toProviderDefinitionRow(normalized))
  }

  deleteProviderDefinition(providerId: string): void {
    if (!providerId) return

    const providerRepo = this.requireProviderRepo()

    providerRepo.getProviderAccountIdsByProviderId(providerId).forEach(accountId => {
      providerRepo.deleteProviderModelsByAccountId(accountId)
    })

    providerRepo.deleteProviderAccountsByProviderId(providerId)
    providerRepo.deleteProviderDefinition(providerId)
  }

  saveProviderAccount(account: ProviderAccount): void {
    if (!account?.id) return

    this.assertProviderExists(account.providerId)
    const providerRepo = this.requireProviderRepo()
    const now = Date.now()

    const tx = this.requireDb().transaction(() => {
      providerRepo.upsertProviderAccount(toProviderAccountRow(account, now))

      const models = account.models || []
      const existingIds = new Set(providerRepo.getProviderModelIdsByAccountId(account.id))
      const incomingIds = new Set(models.map(model => model.id))

      models.forEach(model => {
        providerRepo.upsertProviderModel(toProviderModelRow(account.id, model, now))
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
    this.requireProviderRepo().upsertProviderModel(toProviderModelRow(accountId, model))
  }

  deleteProviderModel(accountId: string, modelId: string): void {
    if (!accountId || !modelId) return
    this.requireProviderRepo().deleteProviderModel(accountId, modelId)
  }

  setProviderModelEnabled(accountId: string, modelId: string, enabled: boolean): void {
    if (!accountId || !modelId) return
    this.requireProviderRepo().updateProviderModelEnabled(accountId, modelId, enabled ? 1 : 0, Date.now())
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

  private requireProviderRepo(): ProviderDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getProviderRepo()
    if (!repo) throw new Error('Provider repository not initialized')
    return repo
  }
}
