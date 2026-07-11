import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENT, CONFIG_EVENT, PLUGIN_EVENT, SCHEDULE_EVENT } from '@shared/constants/index'
import { RUN_EVENTS } from '@shared/run/events'
import { CONFIG_EVENTS } from '@shared/config/events'
import { PLUGIN_EVENTS } from '@shared/plugins/events'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { subscribeRunEvents, subscribeConfigEvents, subscribePluginEvents, subscribeScheduleEvents } from '..'

type Listener = (event: any, data: any) => void

describe('ipcInvoker event channel separation', () => {
  const listeners = new Map<string, Set<Listener>>()

  const ipcRenderer = {
    on: vi.fn((channel: string, handler: Listener) => {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set())
      }
      listeners.get(channel)!.add(handler)
    }),
    removeListener: vi.fn((channel: string, handler: Listener) => {
      listeners.get(channel)?.delete(handler)
    }),
    invoke: vi.fn()
  }

  const emit = (channel: string, payload: any) => {
    for (const handler of listeners.get(channel) || []) {
      handler({}, payload)
    }
  }

  beforeEach(() => {
    delete (globalThis as any).__ATI_IPC_EVENT_REGISTRY__
    listeners.clear()
    ipcRenderer.on.mockClear()
    ipcRenderer.removeListener.mockClear()
    ;(globalThis as any).window = { electron: { ipcRenderer } }
  })

  it('shares one Electron listener until the final same-channel subscriber leaves', () => {
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()

    const unsubscribeFirst = subscribeRunEvents(firstHandler as any)
    const unsubscribeSecond = subscribeRunEvents(secondHandler as any)

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1)
    expect(ipcRenderer.on).toHaveBeenCalledWith(RUN_EVENT, expect.any(Function))

    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 1 }
    })
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled()

    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 2 }
    })
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).toHaveBeenCalledTimes(2)

    unsubscribeSecond()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith(RUN_EVENT, expect.any(Function))
  })

  it('tracks repeated subscriptions of the same callback independently', () => {
    const handler = vi.fn()

    const unsubscribeFirst = subscribeRunEvents(handler as any)
    const unsubscribeSecond = subscribeRunEvents(handler as any)

    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 1 }
    })
    expect(handler).toHaveBeenCalledTimes(2)

    unsubscribeFirst()
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled()

    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 2 }
    })
    expect(handler).toHaveBeenCalledTimes(3)

    unsubscribeSecond()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
  })

  it('reuses the global channel registry after the event module reloads', async () => {
    const initialModule = await import('../events')
    const firstHandler = vi.fn()
    const unsubscribeFirst = initialModule.subscribeRunEvents(firstHandler as any)

    vi.resetModules()
    const reloadedModule = await import('../events')
    const secondHandler = vi.fn()
    const unsubscribeSecond = reloadedModule.subscribeRunEvents(secondHandler as any)

    expect(ipcRenderer.on).toHaveBeenCalledTimes(1)
    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 3 }
    })
    expect(firstHandler).toHaveBeenCalledTimes(1)
    expect(secondHandler).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    expect(ipcRenderer.removeListener).not.toHaveBeenCalled()
    unsubscribeSecond()
    expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1)
  })

  it('does not deliver schedule events to chat-submit subscribers', () => {
    const chatHandler = vi.fn()
    const configHandler = vi.fn()
    const pluginHandler = vi.fn()
    const scheduleHandler = vi.fn()

    const unsubChat = subscribeRunEvents(chatHandler as any)
    const unsubConfig = subscribeConfigEvents(configHandler as any)
    const unsubPlugin = subscribePluginEvents(pluginHandler as any)
    const unsubSchedule = subscribeScheduleEvents(scheduleHandler as any)

    emit(RUN_EVENT, {
      type: RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 1 }
    })
    emit(SCHEDULE_EVENT, {
      type: SCHEDULE_EVENTS.UPDATED,
      payload: { task: { id: 'task-1' } }
    })
    emit(CONFIG_EVENT, {
      type: CONFIG_EVENTS.UPDATED,
      payload: { source: 'test' }
    })
    emit(PLUGIN_EVENT, {
      type: PLUGIN_EVENTS.UPDATED,
      payload: { plugins: [] }
    })

    expect(chatHandler).toHaveBeenCalledTimes(1)
    expect(configHandler).toHaveBeenCalledTimes(1)
    expect(pluginHandler).toHaveBeenCalledTimes(1)
    expect(scheduleHandler).toHaveBeenCalledTimes(1)

    expect(chatHandler.mock.calls[0][0].type).toBe(RUN_EVENTS.RUN_COMPLETED)
    expect(configHandler.mock.calls[0][0].type).toBe(CONFIG_EVENTS.UPDATED)
    expect(pluginHandler.mock.calls[0][0].type).toBe(PLUGIN_EVENTS.UPDATED)
    expect(scheduleHandler.mock.calls[0][0].type).toBe(SCHEDULE_EVENTS.UPDATED)

    unsubChat()
    unsubConfig()
    unsubPlugin()
    unsubSchedule()
  })
})
