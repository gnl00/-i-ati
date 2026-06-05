import {
  builtInPluginRegistry,
  type BuiltInAppPluginDefinition,
  type BuiltInAppPluginId
} from './builtInRegistry'

export { builtInPluginRegistry } from './builtInRegistry'
export type { BuiltInAppPluginId, BuiltInAppPluginDefinition } from './builtInRegistry'

export const getBuiltInRequestAdapterPlugin = (
  pluginId: string
): BuiltInAppPluginDefinition | undefined => {
  return builtInPluginRegistry.getById(pluginId)
}

export const isBuiltInRequestAdapterPluginEnabled = (
  pluginConfigs: AppPluginConfig[] | undefined,
  pluginId: BuiltInAppPluginId
): boolean => {
  return builtInPluginRegistry.isEnabled(pluginConfigs, pluginId)
}

export const getBuiltInRequestAdapterOptions = (): Array<{
  pluginId: BuiltInAppPluginId
  label: string
  providerType: ProviderType
}> => {
  return builtInPluginRegistry.getRequestAdapterOptions()
}

const isRequestAdapterCapabilityData = (value: Record<string, unknown> | undefined): value is {
  providerType: ProviderType
  modelTypes: ModelType[]
} => {
  if (!value) {
    return false
  }

  return typeof value.providerType === 'string'
    && Array.isArray(value.modelTypes)
}

export const getRequestAdapterOptionsFromPlugins = (
  plugins: PluginEntity[] | undefined
): Array<{
  pluginId: string
  label: string
  providerType: ProviderType
  enabled: boolean
}> => {
  if (!plugins || plugins.length === 0) {
    return getBuiltInRequestAdapterOptions().map(option => ({
      ...option,
      enabled: true
    }))
  }

  return (plugins ?? []).flatMap((plugin) =>
    plugin.capabilities.flatMap((capability) => {
      const builtInPlugin = builtInPluginRegistry.getById(plugin.pluginId)
      if (!builtInPlugin) {
        return []
      }
      if (capability.kind !== 'request-adapter' || !isRequestAdapterCapabilityData(capability.data)) {
        return []
      }

      return [{
        pluginId: plugin.pluginId,
        label: builtInPlugin.displayLabel,
        providerType: capability.data.providerType,
        enabled: plugin.enabled && plugin.status === 'installed'
      }]
    })
  )
}

export const getRequestAdapterPluginByIdFromPlugins = (
  plugins: PluginEntity[] | undefined,
  pluginId: string | undefined
): PluginEntity | undefined => {
  if (!pluginId) {
    return undefined
  }

  return (plugins ?? []).find((plugin) =>
    plugin.pluginId === pluginId && Boolean(builtInPluginRegistry.getById(plugin.pluginId))
  )
}

export const isRequestAdapterPluginEnabledFromPlugins = (
  plugins: PluginEntity[] | undefined,
  pluginId: string | undefined
): boolean => {
  const plugin = getRequestAdapterPluginByIdFromPlugins(plugins, pluginId)
  if (!plugin) {
    return true
  }
  return plugin.enabled && plugin.status === 'installed'
}
