export type BuiltInAppPluginId =
  | 'openai-chat-compatible-adapter'
  | 'openai-image-compatible-adapter'
  | 'claude-compatible-adapter'

import type {
  AppPluginSource,
  PluginCapability,
  PluginCapabilityKind,
  RequestAdapterPluginCapability
} from './types'

export interface BuiltInAppPluginDefinition {
  id: BuiltInAppPluginId
  name: string
  displayLabel: string
  description: string
  kind: PluginCapabilityKind
  builtIn: true
  source: AppPluginSource
  capabilities: PluginCapability[]
}

const BUILT_IN_APP_PLUGINS: BuiltInAppPluginDefinition[] = [
  {
    id: 'openai-chat-compatible-adapter',
    name: 'OpenAI Chat Compatible Adapter',
    displayLabel: 'OpenAI Chat Compatible',
    description: 'Built-in adapter for OpenAI-compatible chat completion APIs.',
    kind: 'request-adapter',
    builtIn: true,
    source: 'built-in',
    capabilities: [{
      kind: 'request-adapter',
      providerType: 'openai',
      modelTypes: ['llm', 'vlm']
    }]
  },
  {
    id: 'openai-image-compatible-adapter',
    name: 'OpenAI Image Compatible Adapter',
    displayLabel: 'OpenAI Image Compatible',
    description: 'Built-in adapter for OpenAI-compatible image generation APIs.',
    kind: 'request-adapter',
    builtIn: true,
    source: 'built-in',
    capabilities: [{
      kind: 'request-adapter',
      providerType: 'openai',
      modelTypes: ['t2i']
    }]
  },
  {
    id: 'claude-compatible-adapter',
    name: 'Claude Compatible Adapter',
    displayLabel: 'Claude Compatible',
    description: 'Built-in adapter for Anthropic Claude-compatible Messages APIs.',
    kind: 'request-adapter',
    builtIn: true,
    source: 'built-in',
    capabilities: [{
      kind: 'request-adapter',
      providerType: 'claude',
      modelTypes: ['llm', 'vlm']
    }]
  }
]

export class BuiltInPluginRegistry {
  private readonly definitions: BuiltInAppPluginDefinition[]
  private readonly definitionById: Map<string, BuiltInAppPluginDefinition>

  constructor(definitions: BuiltInAppPluginDefinition[]) {
    this.definitions = definitions
    this.definitionById = new Map(definitions.map(definition => [definition.id, definition]))
  }

  listAll(): BuiltInAppPluginDefinition[] {
    return this.definitions
  }

  getById(pluginId: string): BuiltInAppPluginDefinition | undefined {
    return this.definitionById.get(pluginId)
  }

  normalizeConfigs(pluginConfigs: AppPluginConfig[] | undefined): AppPluginConfig[] {
    const persisted = new Map((pluginConfigs ?? []).map(plugin => [plugin.id, plugin]))

    const mergedBuiltIns = this.definitions.map((definition) => {
      const saved = persisted.get(definition.id)
      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        source: 'built-in' as const,
        enabled: saved?.enabled ?? true,
        version: saved?.version
      }
    })

    const customPlugins = (pluginConfigs ?? []).filter(plugin => !this.definitionById.has(plugin.id))
    return [...mergedBuiltIns, ...customPlugins]
  }

  createDefaultConfigs(): AppPluginConfig[] {
    return this.normalizeConfigs(undefined)
  }

  isEnabled(pluginConfigs: AppPluginConfig[] | undefined, pluginId: BuiltInAppPluginId): boolean {
    const normalizedConfigs = this.normalizeConfigs(pluginConfigs)
    return normalizedConfigs.find(plugin => plugin.id === pluginId)?.enabled !== false
  }

  listRequestAdapterPlugins(): BuiltInAppPluginDefinition[] {
    return this.definitions.filter(definition =>
      definition.capabilities.some(capability => capability.kind === 'request-adapter')
    )
  }

  listCapabilities(kind: 'request-adapter'): Array<{
    plugin: BuiltInAppPluginDefinition
    capability: RequestAdapterPluginCapability
  }>
  listCapabilities(kind: PluginCapabilityKind): Array<{
    plugin: BuiltInAppPluginDefinition
    capability: PluginCapability
  }> {
    return this.definitions.flatMap(plugin =>
      plugin.capabilities
        .filter(capability => capability.kind === kind)
        .map(capability => ({
          plugin,
          capability
        }))
    )
  }

  getRequestAdapterOptions(): Array<{
    providerType: ProviderType
    label: string
    pluginId: BuiltInAppPluginId
  }> {
    return this.listRequestAdapterPlugins().flatMap(definition =>
      definition.capabilities.flatMap(capability => {
        if (capability.kind !== 'request-adapter') {
          return []
        }

        return [{
          providerType: capability.providerType,
          label: definition.displayLabel,
          pluginId: definition.id
        }]
      })
    )
  }
}

export const builtInPluginRegistry = new BuiltInPluginRegistry(BUILT_IN_APP_PLUGINS)
