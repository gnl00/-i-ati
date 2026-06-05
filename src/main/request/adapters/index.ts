export { BaseAdapter } from './base'
export { OpenAIAdapter, OpenAIImage1Adapter, OpenAIResponsesAdapter } from './openai/index'
export { ClaudeAdapter } from './claude'
export { GeminiAdapter } from './gemini'
export { adapterManager } from './manager'
export {
  getRequestAdapterPluginById,
  isRequestAdapterPluginEnabled
} from './plugins'

import { getBuiltInRequestAdapterPlugin } from '@shared/plugins/requestAdapters'
import { adapterManager } from './manager'
import {
  createBuiltInRequestAdapter
} from './plugins'

export async function resolveAdapterForRequest(
  adapterPluginId: string,
  _plugins?: PluginEntity[]
) {
  const cachedAdapter = adapterManager.peekAdapter(adapterPluginId)
  const builtInPlugin = getBuiltInRequestAdapterPlugin(adapterPluginId)

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

  throw new Error(`No built-in adapter found for plugin id: ${adapterPluginId}`)
}

export function invalidateRequestAdapterCache(): void {
  adapterManager.clear()
}
