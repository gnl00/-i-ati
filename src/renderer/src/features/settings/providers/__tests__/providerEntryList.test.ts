import type { ProviderEntry } from '@renderer/infrastructure/config/appConfig'
import { describe, expect, it } from 'vitest'
import { getDefaultProviderId, groupProviderEntries } from '../providerEntryList'

const createProviderEntry = (
  id: string,
  displayName: string,
  enabled?: boolean
): ProviderEntry => {
  return {
    definition: {
      id,
      displayName,
      adapterPluginId: 'openai-chat-compatible-adapter',
      enabled
    },
    models: []
  }
}

describe('provider entry list helpers', () => {
  it('selects the first enabled provider when the original first entry is disabled', () => {
    const providers = [
      createProviderEntry('disabled-provider', 'Alpha', false),
      createProviderEntry('enabled-provider', 'Beta', true)
    ]

    expect(getDefaultProviderId(providers)).toBe('enabled-provider')
  })

  it('sorts provider groups by display name and treats omitted enabled as enabled', () => {
    const providers = [
      createProviderEntry('zulu', 'Zulu', true),
      createProviderEntry('alpha-10', 'Alpha 10'),
      createProviderEntry('disabled-zulu', 'Zulu Disabled', false),
      createProviderEntry('alpha-2', 'alpha 2', true),
      createProviderEntry('disabled-alpha', 'Alpha Disabled', false)
    ]

    const groups = groupProviderEntries(providers)

    expect(groups.enabled.map(entry => entry.definition.id)).toEqual([
      'alpha-2',
      'alpha-10',
      'zulu'
    ])
    expect(groups.disabled.map(entry => entry.definition.id)).toEqual([
      'disabled-alpha',
      'disabled-zulu'
    ])
    expect(getDefaultProviderId(providers)).toBe('alpha-2')
  })

  it('returns no default when every provider is disabled', () => {
    const providers = [
      createProviderEntry('disabled-beta', 'Beta', false),
      createProviderEntry('disabled-alpha', 'Alpha', false)
    ]

    expect(getDefaultProviderId(providers)).toBeUndefined()
  })

  it('uses the same enabled name ordering after the selected provider is removed', () => {
    const providers = [
      createProviderEntry('selected', 'Alpha', true),
      createProviderEntry('disabled', 'Beta', false),
      createProviderEntry('zulu', 'Zulu', true),
      createProviderEntry('bravo', 'Bravo', true)
    ]

    const remainingProviders = providers.filter(entry => entry.definition.id !== 'selected')

    expect(getDefaultProviderId(remainingProviders)).toBe('bravo')
  })
})
