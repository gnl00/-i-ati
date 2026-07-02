export interface FetchModelsTarget {
  account: ProviderAccount
  providerDefinition: ProviderDefinition
}

export interface FetchProviderModelsRequest {
  account: ProviderAccount
}

export type FetchProviderModelsResponse =
  | {
    ok: true
    models: AccountModel[]
    endpoint: string
  }
  | {
    ok: false
    error: string
    endpoint?: string
    status?: number
  }

export interface ApiModelItem {
  id: string
  object?: string
  owned_by?: string
  permission?: unknown[]
}

export interface ApiModelsResponse {
  data: ApiModelItem[]
  object?: 'list' | string
}

export const normalizeModelsEndpoint = (apiUrl: string): string => {
  const trimmedApiUrl = apiUrl.trim()
  if (!trimmedApiUrl) {
    return ''
  }

  const normalizedEndpoint = trimmedApiUrl.replace(/\/+$/, '')
  if (/\/models$/i.test(normalizedEndpoint)) {
    return normalizedEndpoint
  }

  return `${normalizedEndpoint}/models`
}

export const inferFetchedModelType = (modelId: string): ModelType => {
  const id = modelId.toLowerCase()

  if (
    id.includes('dall-e') ||
    id.includes('stable-diffusion') ||
    id.includes('imagen') ||
    id.includes('midjourney')
  ) {
    return 'img_gen'
  }

  if (
    id.includes('gpt-4o') ||
    id.includes('omni') ||
    id.includes('gemini') ||
    id.includes('multimodal') ||
    id.includes('mllm')
  ) {
    return 'mllm'
  }

  if (id.includes('vision')) {
    return 'vlm'
  }

  return 'llm'
}

export const mapApiModelsResponseToAccountModels = (
  response: unknown
): AccountModel[] => {
  if (!response || typeof response !== 'object') {
    throw new Error('Invalid models response: expected JSON object')
  }

  const data = (response as { data?: unknown }).data
  if (!Array.isArray(data)) {
    throw new Error('Invalid models response: data must be an array')
  }

  return data
    .filter((item): item is ApiModelItem => (
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as { id?: unknown }).id === 'string' &&
      (item as { id: string }).id.trim().length > 0
    ))
    .map((apiModel) => ({
      id: apiModel.id,
      label: apiModel.id,
      type: inferFetchedModelType(apiModel.id),
      enabled: true
    }))
}
