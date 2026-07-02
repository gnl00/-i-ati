import { describe, expect, it } from 'vitest'
import {
  buildFetchModelsCacheKey,
  fingerprintApiKey,
  normalizeModelsEndpoint,
  type FetchModelsTarget
} from '../FetchModelsDrawer.cacheKey'

const createTarget = (
  accountOverrides: Partial<ProviderAccount> = {},
  definitionOverrides: Partial<ProviderDefinition> = {}
): FetchModelsTarget => {
  const account: ProviderAccount = {
    id: 'account-1',
    providerId: 'provider-1',
    label: 'Primary',
    apiUrl: 'https://api.example.com/v1/',
    apiKey: 'sk-live-secret-value',
    models: [],
    ...accountOverrides
  }

  const providerDefinition: ProviderDefinition = {
    id: 'provider-1',
    displayName: 'Example',
    adapterPluginId: 'openai-chat-compatible-adapter',
    defaultApiUrl: 'https://api.example.com/v1',
    ...definitionOverrides
  }

  return { account, providerDefinition }
}

const readCacheKey = (target: FetchModelsTarget): Record<string, string> => {
  return JSON.parse(buildFetchModelsCacheKey(target))
}

describe('FetchModelsDrawer cache key helpers', () => {
  it('normalizes models endpoints', () => {
    expect(normalizeModelsEndpoint(' https://api.example.com/v1/// ')).toBe('https://api.example.com/v1/models')
    expect(normalizeModelsEndpoint('https://api.example.com/api/v3')).toBe('https://api.example.com/api/v3/models')
    expect(normalizeModelsEndpoint('https://api.example.com/api/v3/models/')).toBe('https://api.example.com/api/v3/models')
  })

  it('builds a composite key with an API key fingerprint', () => {
    const target = createTarget()
    const cacheKey = buildFetchModelsCacheKey(target)
    const payload = readCacheKey(target)

    expect(payload).toEqual({
      providerId: 'provider-1',
      accountId: 'account-1',
      modelsEndpoint: 'https://api.example.com/v1/models',
      apiKeyFingerprint: fingerprintApiKey('sk-live-secret-value'),
      adapterPluginId: 'openai-chat-compatible-adapter'
    })
    expect(cacheKey.includes('sk-live-secret-value')).toBe(false)
  })

  it('separates cache entries for provider config changes on the same account', () => {
    const baseKey = buildFetchModelsCacheKey(createTarget())

    expect(buildFetchModelsCacheKey(createTarget({}, { id: 'provider-2' }))).not.toBe(baseKey)
    expect(buildFetchModelsCacheKey(createTarget({ apiUrl: 'https://other.example.com/v1' }))).not.toBe(baseKey)
    expect(buildFetchModelsCacheKey(createTarget({ apiKey: 'sk-live-other-value' }))).not.toBe(baseKey)
    expect(buildFetchModelsCacheKey(createTarget({}, { adapterPluginId: 'claude-compatible-adapter' }))).not.toBe(baseKey)
  })
})
