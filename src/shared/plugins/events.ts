export const PLUGIN_EVENTS = {
  UPDATED: 'updated'
} as const

export type PluginEventType = typeof PLUGIN_EVENTS[keyof typeof PLUGIN_EVENTS]

export type PluginEventPayloads = {
  [PLUGIN_EVENTS.UPDATED]: {
    plugins: PluginEntity[]
  }
}

export type PluginEventEnvelope<T extends PluginEventType = PluginEventType> = {
  type: T
  payload: PluginEventPayloads[T]
  sequence: number
  timestamp: number
}

export type PluginEvent = PluginEventEnvelope
