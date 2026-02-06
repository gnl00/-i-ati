import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_SUBMIT_EVENT, SCHEDULE_EVENT } from '@shared/constants/index'
import { subscribeChatSubmitEvents, subscribeScheduleEvents } from '../ipcInvoker'

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

    const unsubChat = subscribeChatSubmitEvents(chatHandler as any)
    const unsubSchedule = subscribeScheduleEvents(scheduleHandler as any)

    emit(CHAT_SUBMIT_EVENT, { type: 'stream.chunk', payload: { contentDelta: 'a' } })
    emit(SCHEDULE_EVENT, { type: 'schedule.updated', payload: { task: { id: 'task-1' } } })

    expect(chatHandler).toHaveBeenCalledTimes(1)
    expect(scheduleHandler).toHaveBeenCalledTimes(1)

    expect(chatHandler.mock.calls[0][0].type).toBe('stream.chunk')
    expect(scheduleHandler.mock.calls[0][0].type).toBe('schedule.updated')

    unsubChat()
    unsubSchedule()
  })
})
