export type AppPluginSource = 'built-in' | 'local' | 'remote'

export type PluginCapabilityKind = 'request-adapter'

export interface RequestAdapterThinkingCapability {
  levels: ThinkingLevel[]
  defaultLevel?: ThinkingLevel
}

export interface RequestAdapterPluginCapability {
  kind: 'request-adapter'
  providerType: ProviderType
  modelTypes: ModelType[]
  thinking?: RequestAdapterThinkingCapability
}

export type PluginCapability = RequestAdapterPluginCapability
