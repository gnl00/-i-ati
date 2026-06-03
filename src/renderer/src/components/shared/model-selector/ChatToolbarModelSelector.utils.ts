import type { ModelOption } from '@renderer/store/appConfig'
import {
  getDefaultThinkingLevel,
  getRequestAdapterThinkingCapability,
  modelSupportsThinking
} from '@shared/plugins/requestAdapterThinking'

export type ModelSelectorGroup = {
  account: ProviderAccount
  definition: ProviderDefinition
  options: ModelOption[]
}

export type ChatToolbarModelSelection = {
  ref: ModelRef
  thinkingLevel?: ThinkingLevel
}

export const resolveChatToolbarModelSelection = (
  option: ModelOption,
  plugins: PluginEntity[] | undefined,
  requestedThinkingLevel?: ThinkingLevel
): ChatToolbarModelSelection => {
  const capability = getRequestAdapterThinkingCapability({
    plugins,
    pluginId: option.definition.adapterPluginId,
    baseUrl: option.account.apiUrl,
    modelId: option.model.id
  })
  const thinkingLevel = modelSupportsThinking(option.model, capability) && capability
    ? requestedThinkingLevel ?? getDefaultThinkingLevel(capability)
    : undefined

  return {
    ref: { accountId: option.account.id, modelId: option.model.id },
    thinkingLevel
  }
}

export const groupModelSelectorOptions = (options: ModelOption[]): ModelSelectorGroup[] => {
  const groups = new Map<string, ModelSelectorGroup>()
  options.forEach(option => {
    const accountId = option.account.id
    if (!groups.has(accountId)) {
      groups.set(accountId, {
        account: option.account,
        definition: option.definition,
        options: []
      })
    }
    groups.get(accountId)!.options.push(option)
  })
  return Array.from(groups.values())
}

const normalizeSearchText = (value: string): string => value.trim().toLowerCase()

const modelMatchesSearchQuery = (option: ModelOption, query: string): boolean => {
  return [
    option.model.label,
    option.model.id
  ].some(value => value.toLowerCase().includes(query))
}

const groupMatchesSearchQuery = (group: ModelSelectorGroup, query: string): boolean => {
  return [
    group.definition.displayName,
    group.definition.id,
    group.account.label,
    group.account.providerId
  ].some(value => value.toLowerCase().includes(query))
}

export const filterModelSelectorGroups = (
  groups: ModelSelectorGroup[],
  query: string
): ModelSelectorGroup[] => {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return groups
  }

  return groups
    .map(group => {
      if (groupMatchesSearchQuery(group, normalizedQuery)) {
        return group
      }

      const matchingOptions = group.options.filter(option => (
        modelMatchesSearchQuery(option, normalizedQuery)
      ))

      return {
        ...group,
        options: matchingOptions
      }
    })
    .filter(group => group.options.length > 0)
}
