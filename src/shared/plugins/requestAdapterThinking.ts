import { builtInPluginRegistry } from './builtInRegistry'
import { getRequestPayloadExtensionById } from './requestPayloadExtensions'
import type { RequestAdapterThinkingCapability } from './types'

const MODEL_REASONING_CAPABILITY_KEYS = new Set([
  'reason',
  'reasoning',
  'thinking'
])

const normalizeCapabilityKey = (value: string): string => value.trim().toLowerCase().replace(/[_\s-]+/g, '')

export const normalizeThinkingCapability = (
  value: unknown
): RequestAdapterThinkingCapability | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  const record = value as Record<string, unknown>
  const levels = Array.isArray(record.levels)
    ? record.levels.filter((level): level is ThinkingLevel =>
      typeof level === 'string' && level.trim().length > 0
    )
    : []

  if (levels.length === 0) {
    return undefined
  }

  const defaultLevel = typeof record.defaultLevel === 'string' && levels.includes(record.defaultLevel)
    ? record.defaultLevel
    : levels.includes('medium')
      ? 'medium'
      : levels[0]

  return {
    levels,
    defaultLevel
  }
}

export const getRequestAdapterThinkingCapability = (
  args: {
    plugins?: PluginEntity[]
    pluginId?: string
    baseUrl?: string
    modelId?: string
    providerType?: string
    payloadExtensions?: ProviderPayloadExtensions
  }
): RequestAdapterThinkingCapability | undefined => {
  const payloadThinkingCapability = getRequestPayloadExtensionById(args.payloadExtensions?.thinking)?.thinking
  if (payloadThinkingCapability) {
    return payloadThinkingCapability
  }

  const plugin = args.pluginId
    ? args.plugins?.find(item => item.pluginId === args.pluginId)
    : undefined
  const pluginCapability = plugin?.capabilities.find(capability => capability.kind === 'request-adapter')
  const declaredCapability = normalizeThinkingCapability(pluginCapability?.data?.thinking)
  if (declaredCapability) {
    return declaredCapability
  }

  const builtInCapability = args.pluginId
    ? builtInPluginRegistry
      .getById(args.pluginId)
      ?.capabilities
      .find(capability => capability.kind === 'request-adapter')
      ?.thinking
    : undefined
  if (builtInCapability) {
    return builtInCapability
  }

  return undefined
}

export const modelHasReasoningCapability = (model: AccountModel | undefined): boolean => {
  if (!model) {
    return false
  }

  const declaredCapabilities = [
    ...(model.capabilities ?? []),
    ...(model.modalities ?? [])
  ]

  return declaredCapabilities.some(capability =>
    MODEL_REASONING_CAPABILITY_KEYS.has(normalizeCapabilityKey(capability))
  )
}

export const modelSupportsThinking = (
  model: AccountModel | undefined,
  capability: RequestAdapterThinkingCapability | undefined
): boolean => {
  return Boolean(capability && modelHasReasoningCapability(model))
}

export const getDefaultThinkingLevel = (
  capability: RequestAdapterThinkingCapability
): ThinkingLevel => {
  return capability.defaultLevel && capability.levels.includes(capability.defaultLevel)
    ? capability.defaultLevel
    : capability.levels.includes('medium')
      ? 'medium'
      : capability.levels[0]
}

export const getEffectiveThinkingLevel = (
  model: AccountModel | undefined,
  capability: RequestAdapterThinkingCapability | undefined,
  selectedLevel: ThinkingLevel | undefined
): ThinkingLevel | undefined => {
  if (!modelSupportsThinking(model, capability) || !capability) {
    return undefined
  }

  return selectedLevel && capability.levels.includes(selectedLevel)
    ? selectedLevel
    : getDefaultThinkingLevel(capability)
}

export const toUnifiedRequestThinkingOption = (
  level: ThinkingLevel | undefined
): UnifiedRequestThinkingOption | undefined => {
  if (!level) {
    return undefined
  }

  if (level === 'none') {
    return { enabled: false }
  }

  return {
    enabled: true,
    effort: level
  }
}
