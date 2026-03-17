export { BaseAdapter } from './base'
export { RequestAdapterPluginWrapper } from './RequestAdapterPluginWrapper'
export { OpenAIAdapter, OpenAIImage1Adapter } from './openai/index'
export { ClaudeAdapter } from './claude'
export { adapterManager } from './manager'
export {
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled
} from './plugins'

import { adapterManager } from './manager'
import { mergeBuiltInPluginConfigs } from '@shared/plugins/requestAdapters'
import { registerEnabledBuiltInRequestAdapters, registerEnabledLocalRequestAdapters } from './plugins'

export async function syncAdaptersWithPlugins(plugins?: PluginEntity[]) {
  const pluginConfigs = (plugins ?? []).map(plugin => ({
    id: plugin.pluginId,
    name: plugin.name,
    description: plugin.description,
    enabled: plugin.enabled,
    source: plugin.source,
    version: plugin.version,
    manifestPath: plugin.manifestPath
  }))
  const enabledPlugins = new Set(
    mergeBuiltInPluginConfigs(pluginConfigs)
      .filter(plugin => plugin.enabled !== false)
      .map(plugin => plugin.id)
  )

  adapterManager.clear()

  registerEnabledBuiltInRequestAdapters(enabledPlugins, (pluginId, adapter) => {
    adapterManager.register(pluginId, adapter)
  })

  await registerEnabledLocalRequestAdapters(plugins ?? [], (pluginId, adapter) => {
    adapterManager.register(pluginId, adapter)
  })

  console.log('Registered adapters:', adapterManager.listAdapters())
}
