export { BaseAdapter } from './base'
export { RequestAdapterPluginWrapper } from './RequestAdapterPluginWrapper'
export { OpenAIAdapter, OpenAIImage1Adapter } from './openai/index'
export { ClaudeAdapter } from './claude'
export { adapterManager } from './manager'
export {
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled
} from './plugins'

import { getBuiltInRequestAdapterPlugin } from '@shared/plugins/requestAdapters'
import { adapterManager } from './manager'
import {
  createBuiltInRequestAdapter,
  getRequestAdapterPluginFingerprint,
  loadLocalRequestAdapter
} from './plugins'

const isLocalRequestAdapterPlugin = (plugin: PluginEntity | null | undefined): plugin is PluginEntity => {
  if (!plugin) {
    return false
  }

  return (plugin.source === 'local' || plugin.source === 'remote')
    && plugin.enabled
    && plugin.status === 'installed'
    && plugin.capabilities.some(capability => capability.kind === 'request-adapter')
}

export async function resolveAdapterForRequest(
  adapterPluginId: string,
  plugins?: PluginEntity[]
) {
  const cachedAdapter = adapterManager.peekAdapter(adapterPluginId)
  const builtInPlugin = getBuiltInRequestAdapterPlugin(adapterPluginId)
  const plugin = (plugins ?? []).find(item => item.pluginId === adapterPluginId)

  if (builtInPlugin) {
    if (cachedAdapter) {
      return cachedAdapter
    }

    const builtInAdapter = createBuiltInRequestAdapter(builtInPlugin.id)
    if (!builtInAdapter) {
      throw new Error(`No built-in adapter factory registered for plugin id: ${builtInPlugin.id}`)
    }

    adapterManager.register(builtInPlugin.id, builtInAdapter)
    return builtInAdapter
  }

  if (!isLocalRequestAdapterPlugin(plugin)) {
    if (cachedAdapter) {
      return cachedAdapter
    }
    throw new Error(`No adapter found for plugin id: ${adapterPluginId}`)
  }

  const fingerprint = getRequestAdapterPluginFingerprint(plugin)
  if (cachedAdapter && adapterManager.getFingerprint(adapterPluginId) === fingerprint) {
    return cachedAdapter
  }

  const failedAdapter = adapterManager.getFailedAdapter(adapterPluginId)
  if (failedAdapter && failedAdapter.fingerprint === fingerprint) {
    throw failedAdapter.error
  }

  adapterManager.delete(adapterPluginId)

  try {
    const adapter = await loadLocalRequestAdapter(plugin)
    adapterManager.register(adapterPluginId, adapter, fingerprint)
    return adapter
  } catch (error) {
    const resolvedError = error instanceof Error
      ? error
      : new Error(String(error))
    adapterManager.setFailedAdapter(adapterPluginId, {
      fingerprint,
      error: resolvedError
    })
    throw resolvedError
  }
}
