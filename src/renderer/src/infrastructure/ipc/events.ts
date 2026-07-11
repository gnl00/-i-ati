import type { ConfigEvent } from '@shared/config/events'
import type { PluginEvent } from '@shared/plugins/events'
import type { RunEvent } from '@shared/run/events'
import type { ScheduleEvent } from '@shared/schedule/events'
import { CONFIG_EVENT, PLUGIN_EVENT, RUN_EVENT, SCHEDULE_EVENT } from '@shared/constants/index'
import { getRendererIpc } from './client'

type ChannelRegistry<TEvent> = {
  handlers: Set<(event: TEvent) => void>
  listener: ((event: unknown, data: unknown) => void) | null
}

type IpcEventRegistryStore = {
  run: ChannelRegistry<RunEvent>
  config: ChannelRegistry<ConfigEvent>
  plugin: ChannelRegistry<PluginEvent>
  schedule: ChannelRegistry<ScheduleEvent>
}

const IPC_EVENT_REGISTRY_KEY = '__ATI_IPC_EVENT_REGISTRY__'

function createChannelRegistry<TEvent>(): ChannelRegistry<TEvent> {
  return { handlers: new Set(), listener: null }
}

function getIpcEventRegistryStore(): IpcEventRegistryStore {
  const globalObject = globalThis as typeof globalThis & { [IPC_EVENT_REGISTRY_KEY]?: IpcEventRegistryStore }
  globalObject[IPC_EVENT_REGISTRY_KEY] ??= {
    run: createChannelRegistry<RunEvent>(),
    config: createChannelRegistry<ConfigEvent>(),
    plugin: createChannelRegistry<PluginEvent>(),
    schedule: createChannelRegistry<ScheduleEvent>()
  }
  return globalObject[IPC_EVENT_REGISTRY_KEY]
}

function subscribeIpcEvent<TEvent>(
  channel: string,
  registry: ChannelRegistry<TEvent>,
  handler: (event: TEvent) => void
): () => void {
  const ipc = getRendererIpc()
  const subscription = (event: TEvent): void => handler(event)
  registry.handlers.add(subscription)
  if (!registry.listener) {
    registry.listener = (_event, data) => registry.handlers.forEach(callback => callback(data as TEvent))
    ipc.on(channel, registry.listener)
  }
  return () => {
    registry.handlers.delete(subscription)
    if (registry.handlers.size === 0 && registry.listener) {
      ipc.removeListener(channel, registry.listener)
      registry.listener = null
    }
  }
}

export const subscribeRunEvents = (handler: (event: RunEvent) => void): (() => void) =>
  subscribeIpcEvent(RUN_EVENT, getIpcEventRegistryStore().run, handler)
export const subscribeConfigEvents = (handler: (event: ConfigEvent) => void): (() => void) =>
  subscribeIpcEvent(CONFIG_EVENT, getIpcEventRegistryStore().config, handler)
export const subscribePluginEvents = (handler: (event: PluginEvent) => void): (() => void) =>
  subscribeIpcEvent(PLUGIN_EVENT, getIpcEventRegistryStore().plugin, handler)
export const subscribeScheduleEvents = (handler: (event: ScheduleEvent) => void): (() => void) =>
  subscribeIpcEvent(SCHEDULE_EVENT, getIpcEventRegistryStore().schedule, handler)

export type { ConfigEventType, ConfigEventPayloads, ConfigEventEnvelope, ConfigEvent } from '@shared/config/events'
export type { PluginEventType, PluginEventPayloads, PluginEventEnvelope, PluginEvent } from '@shared/plugins/events'
export type { ScheduleEventType, ScheduleEventPayloads, ScheduleEventEnvelope, ScheduleEvent } from '@shared/schedule/events'
