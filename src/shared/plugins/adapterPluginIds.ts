export const OPENAI_RESPONSES_COMPATIBLE_ADAPTER_ID = 'openai-responses-compatible-adapter'
export const GOOGLE_GEMINI_COMPATIBLE_ADAPTER_ID = 'google-gemini-compatible-adapter'

const RETIRED_REQUEST_ADAPTER_PLUGIN_IDS = new Set([
  'openai-response-compatible-adapter',
  'gemini-compatible-adapter',
  'google-gemini-compatible-adapter-typescript'
])

export const isRetiredRequestAdapterPluginId = (pluginId: string | undefined): boolean => {
  return Boolean(pluginId && RETIRED_REQUEST_ADAPTER_PLUGIN_IDS.has(pluginId))
}
