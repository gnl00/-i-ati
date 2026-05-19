// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import type { ScheduleTask } from '@shared/tools/schedule'

type UseScheduleNotificationsHook = typeof import('../useScheduleNotifications')['useScheduleNotifications']
type ChatStoreHook = typeof import('@renderer/store/chatStore')['useChatStore']

const scheduleEventMock = vi.hoisted(() => ({
  handler: undefined as ((event: any) => void) | undefined,
  unsubscribe: vi.fn()
}))

vi.mock('@renderer/invoker/ipcInvoker', () => ({
  subscribeScheduleEvents: vi.fn((handler: (event: any) => void) => {
    scheduleEventMock.handler = handler
    return scheduleEventMock.unsubscribe
  })
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@renderer/services/messages/MessagePersistenceService', () => ({
  messagePersistence: {
    getMessagesByChatUuid: vi.fn(async () => []),
    saveMessage: vi.fn(async () => 1),
    updateMessage: vi.fn(),
    patchMessageUiState: vi.fn(),
    deleteMessage: vi.fn()
  }
}))

function buildTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  const now = Date.now()
  return {
    id: 'task-1',
    chat_uuid: 'chat-1',
    plan_id: null,
    goal: '检查定时任务状态',
    run_at: now,
    timezone: null,
    status: 'running',
    payload: null,
    attempt_count: 1,
    max_attempts: 3,
    last_error: null,
    result_message_id: null,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

describe('useScheduleNotifications', () => {
  let container: HTMLDivElement
  let root: Root
  let useScheduleNotifications: UseScheduleNotificationsHook
  let useChatStore: ChatStoreHook

  beforeAll(async () => {
    vi.stubGlobal('__APP_VERSION__', 'test')
    useScheduleNotifications = (await import('../useScheduleNotifications')).useScheduleNotifications
    useChatStore = (await import('@renderer/store/chatStore')).useChatStore
  })

  beforeEach(() => {
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scheduleEventMock.handler = undefined
    scheduleEventMock.unsubscribe.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    useChatStore.setState({
      currentChatId: 1,
      currentChatUuid: 'chat-1',
      messages: [],
      preview: { message: null },
      transcriptBuffersByChatUuid: {},
      runPhase: 'idle',
      postRunJobs: {
        title: 'idle',
        compression: 'idle'
      },
      lastRunOutcome: 'idle',
      runUiByChatUuid: {},
      scrollHint: { type: 'none' }
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  function Probe({ chatUuid }: { chatUuid: string }) {
    useScheduleNotifications(chatUuid)
    return null
  }

  it('owns run phase while the current chat schedule runs', async () => {
    await act(async () => {
      root.render(<Probe chatUuid="chat-1" />)
    })

    const startedTask = buildTask()
    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.STARTED,
        payload: {
          task: startedTask,
          submissionId: 'submission-1',
          attempt: 1
        },
        chatUuid: 'chat-1',
        sequence: 1,
        timestamp: 1000
      })
    })

    expect(useChatStore.getState().getRunStatusForChat('chat-1').runPhase).toBe('submitting')

    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.UPDATED,
        payload: {
          task: buildTask({ status: 'completed' })
        },
        chatUuid: 'chat-1',
        sequence: 2,
        timestamp: 2000
      })
    })

    expect(useChatStore.getState().getRunStatusForChat('chat-1').runPhase).toBe('idle')
  })

  it('upserts final schedule messages for the current chat', async () => {
    await act(async () => {
      root.render(<Probe chatUuid="chat-1" />)
    })

    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.MESSAGE_CREATED,
        payload: {
          message: {
            id: 99,
            chatId: 1,
            chatUuid: 'chat-1',
            body: {
              role: 'assistant',
              content: '定时任务完成',
              source: 'schedule',
              segments: []
            }
          } satisfies MessageEntity
        },
        chatUuid: 'chat-1',
        sequence: 1,
        timestamp: 1000
      })
    })

    expect(useChatStore.getState().messages.map(message => message.id)).toEqual([99])
  })
})
