import type { ProviderEntry } from '@renderer/infrastructure/config/appConfig'

export type ProviderEntryGroups = {
  enabled: ProviderEntry[]
  disabled: ProviderEntry[]
}

const getProviderSortName = (entry: ProviderEntry): string => {
  return entry.definition.displayName || entry.definition.id
}

const compareProviderEntriesByName = (left: ProviderEntry, right: ProviderEntry): number => {
  const result = getProviderSortName(left).localeCompare(getProviderSortName(right), undefined, {
    sensitivity: 'base',
    numeric: true
  })

  return result || left.definition.id.localeCompare(right.definition.id)
}

export const groupProviderEntries = (providers: readonly ProviderEntry[]): ProviderEntryGroups => {
  return {
    enabled: providers
      .filter(entry => entry.definition.enabled !== false)
      .sort(compareProviderEntriesByName),
    disabled: providers
      .filter(entry => entry.definition.enabled === false)
      .sort(compareProviderEntriesByName)
  }
}

export const getDefaultProviderId = (providers: readonly ProviderEntry[]): string | undefined => {
  return groupProviderEntries(providers).enabled[0]?.definition.id
}
