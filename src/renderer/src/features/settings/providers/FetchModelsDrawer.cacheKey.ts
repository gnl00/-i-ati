import {
  normalizeModelsEndpoint,
  type FetchModelsTarget
} from '@shared/providers/fetchModels'

export {
  normalizeModelsEndpoint,
  type FetchModelsTarget
} from '@shared/providers/fetchModels'

export const fingerprintApiKey = (apiKey: string): string => {
  const normalizedApiKey = apiKey.trim()
  if (!normalizedApiKey) {
    return 'empty'
  }

  let hash = 2166136261
  for (let index = 0; index < normalizedApiKey.length; index += 1) {
    hash ^= normalizedApiKey.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `${normalizedApiKey.length}:${(hash >>> 0).toString(36)}`
}

export const buildFetchModelsCacheKey = (target: FetchModelsTarget): string => {
  const providerId = target.providerDefinition.id.trim() || target.account.providerId.trim()
  const accountId = target.account.id.trim()
  const modelsEndpoint = normalizeModelsEndpoint(target.account.apiUrl)
  const apiKeyFingerprint = fingerprintApiKey(target.account.apiKey)
  const adapterPluginId = target.providerDefinition.adapterPluginId.trim()

  return JSON.stringify({
    providerId,
    accountId,
    modelsEndpoint,
    apiKeyFingerprint,
    adapterPluginId
  })
}
