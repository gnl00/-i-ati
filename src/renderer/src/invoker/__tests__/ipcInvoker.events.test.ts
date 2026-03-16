import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENT, SCHEDULE_EVENT } from '@shared/constants/index'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { subscribeChatRunEvents, subscribeScheduleEvents } from '../ipcInvoker'

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
    listeners.clear()
    ipcRenderer.on.mockClear()
    ipcRenderer.removeListener.mockClear()
    ;(globalThis as any).window = { electron: { ipcRenderer } }
  })

  it('does not deliver schedule events to chat-submit subscribers', () => {
    const chatHandler = vi.fn()
    const scheduleHandler = vi.fn()

    const unsubChat = subscribeChatRunEvents(chatHandler as any)
    const unsubSchedule = subscribeScheduleEvents(scheduleHandler as any)

    emit(CHAT_RUN_EVENT, {
      type: CHAT_RUN_EVENTS.RUN_COMPLETED,
      payload: { assistantMessageId: 1 }
    })
    emit(SCHEDULE_EVENT, {
      type: SCHEDULE_EVENTS.UPDATED,
      payload: { task: { id: 'task-1' } }
    })

    expect(chatHandler).toHaveBeenCalledTimes(1)
    expect(scheduleHandler).toHaveBeenCalledTimes(1)

    expect(chatHandler.mock.calls[0][0].type).toBe(CHAT_RUN_EVENTS.RUN_COMPLETED)
    expect(scheduleHandler.mock.calls[0][0].type).toBe(SCHEDULE_EVENTS.UPDATED)

    unsubChat()
    unsubSchedule()
  })
})
