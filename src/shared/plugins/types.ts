export type AppPluginSource = 'built-in' | 'local' | 'remote'

export type PluginCapabilityKind = 'request-adapter'

export interface RequestAdapterPluginCapability {
  kind: 'request-adapter'
  providerType: ProviderType
  modelTypes: ModelType[]
}

export type PluginCapability = RequestAdapterPluginCapability
