export type ModelsDevModalities = {
  input?: unknown
  output?: unknown
}

export type ModelsDevInterleaved = boolean | {
  field?: unknown
}

export type ModelsDevModel = {
  id?: unknown
  name?: unknown
  attachment?: unknown
  reasoning?: unknown
  tool_call?: unknown
  structured_output?: unknown
  temperature?: unknown
  knowledge?: unknown
  release_date?: unknown
  last_updated?: unknown
  open_weights?: unknown
  interleaved?: unknown
  limit?: unknown
  modalities?: unknown
}

export type ModelsDevProvider = {
  id?: unknown
  name?: unknown
  models?: unknown
}

export type ModelsDevApiResponse = Record<string, ModelsDevProvider>

export type GetModelCapabilitiesRequest = {
  modelIds: string[]
}

export type ModelCapabilitySnapshot = {
  modelId: string
  name?: string
  modalities: string[]
  capabilities: string[]
  knowledge?: string
  releaseDate?: string
  lastUpdated?: string
  contextWindowTokens?: number
  sourceDate: string
}

export type GetModelCapabilitiesResponse = {
  models: Record<string, ModelCapabilitySnapshot | null>
}

const MODALITY_ORDER = ['text', 'image', 'audio', 'video', 'pdf', 'tool', 'reason']
const CAPABILITY_ORDER = ['tool', 'reasoning', 'structured_output', 'temperature', 'open_weights', 'attachment']

const normalizeToken = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase().replace(/[_\s-]+/g, '_')
  return normalized || undefined
}

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeToken)
    .filter((item): item is string => Boolean(item))
}

const orderTokens = (items: Set<string>, preferredOrder: string[]): string[] => {
  const ordered = preferredOrder.filter(item => items.has(item))
  const remaining = Array.from(items)
    .filter(item => !preferredOrder.includes(item))
    .sort((left, right) => left.localeCompare(right))

  return [...ordered, ...remaining]
}

const getOptionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

const getPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined
  }

  return Math.floor(value)
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export const isModelsDevApiResponse = (value: unknown): value is ModelsDevApiResponse => {
  return isRecord(value)
}

export const mapModelsDevModelToCapabilitySnapshot = (
  model: ModelsDevModel,
  fallbackModelId: string,
  sourceDate: string
): ModelCapabilitySnapshot | undefined => {
  if (!isRecord(model)) {
    return undefined
  }

  const modelId = getOptionalString(model.id) ?? fallbackModelId.trim()
  if (!modelId) {
    return undefined
  }

  const modalities = new Set<string>()
  const capabilities = new Set<string>()

  if (isRecord(model.modalities)) {
    toStringArray(model.modalities.input).forEach(item => modalities.add(item))
    toStringArray(model.modalities.output).forEach(item => modalities.add(item))
  }

  if (model.tool_call === true) {
    modalities.add('tool')
    capabilities.add('tool')
  }

  if (model.reasoning === true || Boolean(model.interleaved)) {
    modalities.add('reason')
    capabilities.add('reasoning')
  }

  if (model.structured_output === true) {
    capabilities.add('structured_output')
  }

  if (model.temperature === true) {
    capabilities.add('temperature')
  }

  if (model.open_weights === true) {
    capabilities.add('open_weights')
  }

  if (model.attachment === true) {
    capabilities.add('attachment')
  }

  return {
    modelId,
    name: getOptionalString(model.name),
    modalities: orderTokens(modalities, MODALITY_ORDER),
    capabilities: orderTokens(capabilities, CAPABILITY_ORDER),
    knowledge: getOptionalString(model.knowledge),
    releaseDate: getOptionalString(model.release_date),
    lastUpdated: getOptionalString(model.last_updated),
    contextWindowTokens: isRecord(model.limit)
      ? getPositiveInteger(model.limit.context)
      : undefined,
    sourceDate
  }
}

export const buildModelsDevCapabilityIndex = (
  data: unknown,
  sourceDate: string
): Map<string, ModelCapabilitySnapshot> => {
  const index = new Map<string, ModelCapabilitySnapshot>()

  if (!isModelsDevApiResponse(data)) {
    return index
  }

  Object.values(data).forEach((provider) => {
    if (!isRecord(provider?.models)) {
      return
    }

    Object.entries(provider.models).forEach(([fallbackModelId, rawModel]) => {
      const snapshot = mapModelsDevModelToCapabilitySnapshot(
        rawModel as ModelsDevModel,
        fallbackModelId,
        sourceDate
      )
      if (!snapshot) {
        return
      }

      const existing = index.get(snapshot.modelId)
      if (!existing) {
        index.set(snapshot.modelId, snapshot)
        return
      }

      const mergedModalities = new Set([...existing.modalities, ...snapshot.modalities])
      const mergedCapabilities = new Set([...existing.capabilities, ...snapshot.capabilities])
      index.set(snapshot.modelId, {
        ...existing,
        name: existing.name ?? snapshot.name,
        modalities: orderTokens(mergedModalities, MODALITY_ORDER),
        capabilities: orderTokens(mergedCapabilities, CAPABILITY_ORDER),
        knowledge: existing.knowledge ?? snapshot.knowledge,
        releaseDate: existing.releaseDate ?? snapshot.releaseDate,
        lastUpdated: maxDateLike(existing.lastUpdated, snapshot.lastUpdated),
        contextWindowTokens: existing.contextWindowTokens ?? snapshot.contextWindowTokens,
        sourceDate: existing.sourceDate
      })
    })
  })

  return index
}

const maxDateLike = (left: string | undefined, right: string | undefined): string | undefined => {
  if (!left) return right
  if (!right) return left
  return right.localeCompare(left) > 0 ? right : left
}
