export type AppPluginSource = 'built-in' | 'local' | 'remote'

export type PluginCapabilityKind = 'request-adapter' | 'request-payload-extension'

export interface RequestAdapterThinkingCapability {
  levels: ThinkingLevel[]
  defaultLevel?: ThinkingLevel
}

export type RequestPayloadPatchOperation =
  | {
    op: 'set'
    path: string
    value: unknown
  }
  | {
    op: 'unset'
    path: string
  }
  | {
    op: 'setFromThinkingEffort'
    path: string
    allowedValues?: ThinkingLevel[]
  }

export interface ThinkingRequestPayloadPatches {
  enabled: RequestPayloadPatchOperation[]
  disabled: RequestPayloadPatchOperation[]
}

export interface RequestPayloadExtensionPatches {
  thinking?: ThinkingRequestPayloadPatches
}

export interface RequestAdapterPluginCapability {
  kind: 'request-adapter'
  providerType: ProviderType
  modelTypes: ModelType[]
  thinking?: RequestAdapterThinkingCapability
}

export interface RequestPayloadExtensionPluginCapability {
  kind: 'request-payload-extension'
  feature: 'thinking'
  thinking?: RequestAdapterThinkingCapability
  matchHints?: {
    baseUrlKeywords?: string[]
    modelKeywords?: string[]
  }
  patches?: RequestPayloadExtensionPatches
}

export type PluginCapability = RequestAdapterPluginCapability | RequestPayloadExtensionPluginCapability
