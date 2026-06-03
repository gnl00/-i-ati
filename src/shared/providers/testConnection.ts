export interface ProviderTestConnectionRequest {
  providerDefinition: ProviderDefinition
  account: ProviderAccount
}

export interface ProviderTestConnectionResponse {
  ok: boolean
  modelId: string
  contentPreview?: string
  error?: string
}
