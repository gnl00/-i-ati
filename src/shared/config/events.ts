export const CONFIG_EVENTS = {
  UPDATED: 'updated'
} as const

export type ConfigEventType = typeof CONFIG_EVENTS[keyof typeof CONFIG_EVENTS]

export type ConfigEventPayloads = {
  [CONFIG_EVENTS.UPDATED]: {
    source?: string
  }
}

export type ConfigEventEnvelope<T extends ConfigEventType = ConfigEventType> = {
  type: T
  payload: ConfigEventPayloads[T]
  sequence: number
  timestamp: number
}

export type ConfigEvent = ConfigEventEnvelope
