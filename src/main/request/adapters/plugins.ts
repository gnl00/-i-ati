import {
  getBuiltInRequestAdapterPlugin,
  getRequestAdapterPluginByIdFromPlugins,
  isBuiltInRequestAdapterPluginEnabled,
  isRequestAdapterPluginEnabledFromPlugins,
  type BuiltInAppPluginId
} from '@shared/plugins/requestAdapters'
import {
  GOOGLE_GEMINI_COMPATIBLE_ADAPTER_ID,
  OPENAI_RESPONSES_COMPATIBLE_ADAPTER_ID
} from '@shared/plugins/adapterPluginIds'
import type { BaseAdapter } from './base'
import { ClaudeAdapter } from './claude'
import { GeminiAdapter } from './gemini'
import { OpenAIAdapter, OpenAIImage1Adapter, OpenAIResponsesAdapter } from './openai/index'

type RequestAdapterFactory = () => BaseAdapter

const requestAdapterFactories = new Map<BuiltInAppPluginId, RequestAdapterFactory>([
  ['openai-chat-compatible-adapter', () => new OpenAIAdapter()],
  ['openai-image-compatible-adapter', () => new OpenAIImage1Adapter()],
  ['claude-compatible-adapter', () => new ClaudeAdapter()],
  [OPENAI_RESPONSES_COMPATIBLE_ADAPTER_ID, () => new OpenAIResponsesAdapter()],
  [GOOGLE_GEMINI_COMPATIBLE_ADAPTER_ID, () => new GeminiAdapter()]
])

export const createBuiltInRequestAdapter = (pluginId: string): BaseAdapter | null => {
  const createAdapter = requestAdapterFactories.get(pluginId as BuiltInAppPluginId)
  return createAdapter ? createAdapter() : null
}

export const getRequestAdapterPluginById = (
  pluginId: string | undefined,
  plugins?: PluginEntity[]
) => {
  return getRequestAdapterPluginByIdFromPlugins(plugins, pluginId)
    ?? getBuiltInRequestAdapterPlugin(pluginId ?? '')
}

export const isRequestAdapterPluginEnabled = (
  pluginConfigs: AppPluginConfig[] | undefined,
  pluginId: string | undefined,
  plugins?: PluginEntity[]
): boolean => {
  if (plugins?.length) {
    return isRequestAdapterPluginEnabledFromPlugins(plugins, pluginId)
  }

  if (!pluginId) {
    return true
  }

  const plugin = getBuiltInRequestAdapterPlugin(pluginId)
  if (!plugin) {
    return true
  }
  return isBuiltInRequestAdapterPluginEnabled(pluginConfigs, plugin.id)
}
