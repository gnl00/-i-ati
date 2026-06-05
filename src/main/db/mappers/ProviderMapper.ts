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

const parsePayloadExtensions = (value: string | null): ProviderPayloadExtensions | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    const thinking = typeof parsed.thinking === 'string' && parsed.thinking.trim().length > 0
      ? parsed.thinking
      : undefined
    return thinking ? { thinking } : undefined
  } catch {
    return undefined
  }
}

const serializePayloadExtensions = (
  payloadExtensions: ProviderPayloadExtensions | undefined
): string | null => {
  if (!payloadExtensions?.thinking) {
    return null
  }
  return JSON.stringify({ thinking: payloadExtensions.thinking })
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

const parseStringArray = (value: string | null): string[] | undefined => {
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
  enabled: row.enabled !== 0,
  iconKey: row.icon_key ?? undefined,
  defaultApiUrl: row.default_api_url ?? undefined,
  payloadExtensions: parsePayloadExtensions(row.payload_extensions),
  requestOverrides: parseRequestOverrides(row.request_overrides)
})

export const toProviderDefinitionRow = (
  definition: ProviderDefinition,
  now = Date.now()
): ProviderDefinitionRow => ({
  id: definition.id,
  display_name: definition.displayName,
  adapter_plugin_id: definition.adapterPluginId,
  enabled: definition.enabled === false ? 0 : 1,
  icon_key: definition.iconKey ?? null,
  default_api_url: definition.defaultApiUrl ?? null,
  payload_extensions: serializePayloadExtensions(definition.payloadExtensions),
  request_overrides: definition.requestOverrides ? JSON.stringify(definition.requestOverrides) : null,
  created_at: now,
  updated_at: now
})

export const toAccountModelEntity = (row: ProviderModelRow): AccountModel => ({
  id: row.model_id,
  label: row.label,
  type: row.type as ModelType,
  modalities: parseModalities(row.modalities_json),
  capabilities: parseStringArray(row.capabilities_json),
  contextWindowTokens: row.context_window_tokens ?? undefined,
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
  capabilities_json: model.capabilities?.length ? JSON.stringify(model.capabilities) : null,
  context_window_tokens: model.contextWindowTokens ?? null,
  enabled: model.enabled ? 1 : 0,
  created_at: now,
  updated_at: now
})
