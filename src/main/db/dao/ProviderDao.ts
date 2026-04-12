import type Database from 'better-sqlite3'

interface ProviderDefinitionRow {
  id: string
  display_name: string
  adapter_plugin_id: string
  icon_key: string | null
  default_api_url: string | null
  request_overrides: string | null
  created_at: number
  updated_at: number
}

interface ProviderAccountRow {
  id: string
  provider_id: string
  label: string
  api_url: string
  api_key: string
  created_at: number
  updated_at: number
}

interface ProviderModelRow {
  account_id: string
  model_id: string
  label: string
  type: string
  modalities_json: string | null
  enabled: number
  created_at: number
  updated_at: number
}

class ProviderDao {
  private stmts: {
    getProviderDefinitions: Database.Statement
    getProviderDefinitionById: Database.Statement
    countProviderDefinitions: Database.Statement
    upsertProviderDefinition: Database.Statement
    deleteProviderDefinition: Database.Statement
    getProviderAccounts: Database.Statement
    upsertProviderAccount: Database.Statement
    deleteProviderAccount: Database.Statement
    deleteProviderAccountsByProviderId: Database.Statement
    getProviderModels: Database.Statement
    upsertProviderModel: Database.Statement
    deleteProviderModelsByAccountId: Database.Statement
    deleteProviderModel: Database.Statement
    updateProviderModelEnabled: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      getProviderDefinitions: db.prepare(`
        SELECT * FROM provider_definitions
        ORDER BY display_name ASC
      `),
      getProviderDefinitionById: db.prepare(`
        SELECT * FROM provider_definitions WHERE id = ?
      `),
      countProviderDefinitions: db.prepare(`
        SELECT COUNT(*) as count FROM provider_definitions
      `),
      upsertProviderDefinition: db.prepare(`
        INSERT INTO provider_definitions (
          id, display_name, adapter_plugin_id, icon_key, default_api_url, request_overrides, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name = excluded.display_name,
          adapter_plugin_id = excluded.adapter_plugin_id,
          icon_key = excluded.icon_key,
          default_api_url = excluded.default_api_url,
          request_overrides = excluded.request_overrides,
          updated_at = excluded.updated_at
      `),
      deleteProviderDefinition: db.prepare(`
        DELETE FROM provider_definitions WHERE id = ?
      `),
      getProviderAccounts: db.prepare(`
        SELECT * FROM provider_accounts
        ORDER BY updated_at DESC
      `),
      upsertProviderAccount: db.prepare(`
        INSERT INTO provider_accounts (
          id, provider_id, label, api_url, api_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          provider_id = excluded.provider_id,
          label = excluded.label,
          api_url = excluded.api_url,
          api_key = excluded.api_key,
          updated_at = excluded.updated_at
      `),
      deleteProviderAccount: db.prepare(`
        DELETE FROM provider_accounts WHERE id = ?
      `),
      deleteProviderAccountsByProviderId: db.prepare(`
        DELETE FROM provider_accounts WHERE provider_id = ?
      `),
      getProviderModels: db.prepare(`
        SELECT * FROM provider_models
        ORDER BY updated_at DESC
      `),
      upsertProviderModel: db.prepare(`
        INSERT INTO provider_models (
          account_id, model_id, label, type, modalities_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id, model_id) DO UPDATE SET
          label = excluded.label,
          type = excluded.type,
          modalities_json = excluded.modalities_json,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `),
      deleteProviderModelsByAccountId: db.prepare(`
        DELETE FROM provider_models WHERE account_id = ?
      `),
      deleteProviderModel: db.prepare(`
        DELETE FROM provider_models WHERE account_id = ? AND model_id = ?
      `),
      updateProviderModelEnabled: db.prepare(`
        UPDATE provider_models SET enabled = ?, updated_at = ?
        WHERE account_id = ? AND model_id = ?
      `)
    }
  }

  getProviderDefinitions(): ProviderDefinitionRow[] {
    return this.stmts.getProviderDefinitions.all() as ProviderDefinitionRow[]
  }

  getProviderDefinitionById(id: string): ProviderDefinitionRow | undefined {
    return this.stmts.getProviderDefinitionById.get(id) as ProviderDefinitionRow | undefined
  }

  countProviderDefinitions(): number {
    const row = this.stmts.countProviderDefinitions.get() as { count: number }
    return row?.count ?? 0
  }

  upsertProviderDefinition(row: ProviderDefinitionRow): void {
    this.stmts.upsertProviderDefinition.run(
      row.id,
      row.display_name,
      row.adapter_plugin_id,
      row.icon_key ?? null,
      row.default_api_url ?? null,
      row.request_overrides ?? null,
      row.created_at,
      row.updated_at
    )
  }

  deleteProviderDefinition(id: string): void {
    this.stmts.deleteProviderDefinition.run(id)
  }

  getProviderAccounts(): ProviderAccountRow[] {
    return this.stmts.getProviderAccounts.all() as ProviderAccountRow[]
  }

  upsertProviderAccount(row: ProviderAccountRow): void {
    this.stmts.upsertProviderAccount.run(
      row.id,
      row.provider_id,
      row.label,
      row.api_url,
      row.api_key,
      row.created_at,
      row.updated_at
    )
  }

  deleteProviderAccount(id: string): void {
    this.stmts.deleteProviderAccount.run(id)
  }

  deleteProviderAccountsByProviderId(providerId: string): void {
    this.stmts.deleteProviderAccountsByProviderId.run(providerId)
  }

  getProviderModels(): ProviderModelRow[] {
    return this.stmts.getProviderModels.all() as ProviderModelRow[]
  }

  upsertProviderModel(row: ProviderModelRow): void {
    this.stmts.upsertProviderModel.run(
      row.account_id,
      row.model_id,
      row.label,
      row.type,
      row.modalities_json ?? null,
      row.enabled,
      row.created_at,
      row.updated_at
    )
  }

  deleteProviderModelsByAccountId(accountId: string): void {
    this.stmts.deleteProviderModelsByAccountId.run(accountId)
  }

  deleteProviderModel(accountId: string, modelId: string): void {
    this.stmts.deleteProviderModel.run(accountId, modelId)
  }

  updateProviderModelEnabled(accountId: string, modelId: string, enabled: number): void {
    this.stmts.updateProviderModelEnabled.run(enabled, Date.now(), accountId, modelId)
  }
}

export { ProviderDao }
export type { ProviderDefinitionRow, ProviderAccountRow, ProviderModelRow }
