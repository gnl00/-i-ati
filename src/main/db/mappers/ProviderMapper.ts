import type {
  ProviderAccountRow,
  ProviderDefinitionRow,
  ProviderModelRow
} from '@main/db/dao/ProviderDao'

const parseRequestOverrides = (value: string | null): Record<string, any> | undefined => {
  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(value) as Record<string, any>
  } catch {
    return undefined
  }
}

const parseModalities = (value: string | null): string[] | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : undefined
  } catch {
    return undefined
  }
}

export const toProviderDefinitionEntity = (row: ProviderDefinitionRow): ProviderDefinition => ({
  id: row.id,
  displayName: row.display_name,
  adapterPluginId: row.adapter_plugin_id,
  iconKey: row.icon_key ?? undefined,
  defaultApiUrl: row.default_api_url ?? undefined,
  requestOverrides: parseRequestOverrides(row.request_overrides)
})

export const toProviderDefinitionRow = (
  definition: ProviderDefinition,
  now = Date.now()
): ProviderDefinitionRow => ({
  id: definition.id,
  display_name: definition.displayName,
  adapter_plugin_id: definition.adapterPluginId,
  icon_key: definition.iconKey ?? null,
  default_api_url: definition.defaultApiUrl ?? null,
  request_overrides: definition.requestOverrides ? JSON.stringify(definition.requestOverrides) : null,
  created_at: now,
  updated_at: now
})

export const toAccountModelEntity = (row: ProviderModelRow): AccountModel => ({
  id: row.model_id,
  label: row.label,
  type: row.type as ModelType,
  modalities: parseModalities(row.modalities_json),
  enabled: row.enabled === 1
})

export const toProviderAccountEntity = (
  row: ProviderAccountRow,
  models: AccountModel[]
): ProviderAccount => ({
  id: row.id,
  providerId: row.provider_id,
  label: row.label,
  apiUrl: row.api_url,
  apiKey: row.api_key,
  models
})

export const toProviderAccountRow = (
  account: ProviderAccount,
  now = Date.now()
): ProviderAccountRow => ({
  id: account.id,
  provider_id: account.providerId,
  label: account.label,
  api_url: account.apiUrl,
  api_key: account.apiKey,
  created_at: now,
  updated_at: now
})

export const toProviderModelRow = (
  accountId: string,
  model: AccountModel,
  now = Date.now()
): ProviderModelRow => ({
  account_id: accountId,
  model_id: model.id,
  label: model.label,
  type: model.type,
  modalities_json: model.modalities?.length ? JSON.stringify(model.modalities) : null,
  enabled: model.enabled ? 1 : 0,
  created_at: now,
  updated_at: now
})
