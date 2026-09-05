// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import type { ScheduleEvent } from '@shared/schedule/events'
import type { ScheduleTask } from '@shared/tools/schedule'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import type { RunEvent } from '@shared/run/events'
import { toast } from 'sonner'

type UseScheduleNotificationsHook = typeof import('../useScheduleNotifications')['useScheduleNotifications']
type ChatStoreHook = typeof import('@renderer/features/chat/state/chatStore')['useChatStore']

const scheduleEventMock = vi.hoisted(() => ({
  handler: undefined as ((event: ScheduleEvent) => void) | undefined,
  unsubscribe: vi.fn()
}))
const runEventMock = vi.hoisted(() => ({
  handlers: new Set<(event: RunEvent) => void>(),
  unsubscribe: vi.fn()
}))

vi.mock('@renderer/infrastructure/ipc', () => ({
  subscribeScheduleEvents: vi.fn((handler: (event: ScheduleEvent) => void) => {
    scheduleEventMock.handler = handler
    return scheduleEventMock.unsubscribe
  }),
  subscribeRunEvents: vi.fn((handler: (event: RunEvent) => void) => {
    runEventMock.handlers.add(handler)
    return (): void => { runEventMock.handlers.delete(handler) }
  })
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@renderer/features/chat/persistenceService', () => ({
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
    schedule_type: 'once',
    cron_expression: null,
    run_at: now,
    timezone: null,
    status: 'running',
    payload: null,
    max_attempts: 3,
    last_run_at: null,
    last_run_status: null,
    run_count: 0,
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
    useChatStore = (await import('@renderer/features/chat/state/chatStore')).useChatStore
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    scheduleEventMock.handler = undefined
    scheduleEventMock.unsubscribe.mockReset()
    runEventMock.handlers.clear()
    runEventMock.unsubscribe.mockReset()
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

  function Probe({ chatUuid }: { chatUuid: string }): null {
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
          run: {
            id: 'run-1', task_id: startedTask.id, scheduled_for: 1000, next_attempt_at: 1000,
            status: 'running', attempt_count: 1, submission_id: 'submission-1', started_at: 1000,
            execution_chat_uuid: 'execution-1', finished_at: null, last_error: null, result_message_id: null,
            created_at: 1000, updated_at: 1000
          },
          submissionId: 'submission-1',
          attempt: 1,
          executionChat: {
            id: 2,
            uuid: 'execution-1',
            title: 'Scheduled execution',
            messages: [],
            msgCount: 0,
            modelRef: { accountId: 'a', modelId: 'm' },
            workspacePath: '/tmp/source-workspace',
            userInstruction: '',
            permissionApprovalMode: 'auto',
            createTime: 1000,
            updateTime: 1000
          }
        },
        chatUuid: 'chat-1',
        sequence: 1,
        timestamp: 1000
      })
    })

    expect(useChatStore.getState().getRunStatusForChat('execution-1').runPhase).toBe('submitting')

    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.RUN_FINISHED,
        payload: {
          task: buildTask({ status: 'pending', schedule_type: 'cron' }),
          run: {
            id: 'run-1',
            task_id: 'task-1',
            scheduled_for: 1000,
            next_attempt_at: 1000,
            status: 'completed',
            attempt_count: 1,
            submission_id: 'submission-1',
            execution_chat_uuid: 'execution-1',
            started_at: 1000,
            finished_at: 2000,
            last_error: null,
            result_message_id: 99,
            created_at: 1000,
            updated_at: 2000
          }
        },
        chatUuid: 'chat-1',
        sequence: 2,
        timestamp: 2000
      })
    })

    expect(useChatStore.getState().getRunStatusForChat('execution-1').runPhase).toBe('idle')
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

  it('keeps the execution binding while the selected chat changes', async () => {
    await act(async () => {
      root.render(<Probe chatUuid="chat-1" />)
    })

    const task = buildTask()
    const executionChat: ChatEntity = {
      id: 2,
      uuid: 'execution-1',
      title: 'Scheduled execution',
      messages: [],
      msgCount: 0,
      modelRef: { accountId: 'a', modelId: 'm' },
      createTime: 1000,
      updateTime: 1000
    }
    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.STARTED,
        payload: {
          task,
          run: {
            id: 'run-1', task_id: task.id, scheduled_for: 1000, next_attempt_at: 1000,
            status: 'running', attempt_count: 1, submission_id: 'submission-1',
            execution_chat_uuid: executionChat.uuid, started_at: 1000, finished_at: null,
            last_error: null, result_message_id: null, created_at: 1000, updated_at: 1000
          },
          submissionId: 'submission-1',
          attempt: 1,
          executionChat
        },
        chatUuid: task.chat_uuid,
        sequence: 1,
        timestamp: 1000
      })
    })

    useChatStore.getState().selectChatShell(executionChat.id!, executionChat.uuid, executionChat)
    await act(async () => {
      root.render(<Probe chatUuid="execution-1" />)
    })

    const message: MessageEntity = {
      id: 101,
      chatId: executionChat.id,
      chatUuid: executionChat.uuid,
      body: { role: 'assistant', content: '实时结果', source: 'schedule', segments: [] }
    }
    await act(async () => {
      for (const handler of runEventMock.handlers) {
        handler({
          type: CHAT_RENDER_EVENTS.MESSAGE_CREATED,
          submissionId: 'submission-1',
          chatUuid: executionChat.uuid,
          chatId: executionChat.id,
          sequence: 2,
          timestamp: 1100,
          payload: { message }
        })
      }
    })
    expect(useChatStore.getState().messages.map(item => item.id)).toContain(101)

    await act(async () => {
      for (const handler of runEventMock.handlers) {
        handler({
          type: RUN_LIFECYCLE_EVENTS.RUN_FAILED,
          submissionId: 'submission-1',
          chatUuid: executionChat.uuid,
          chatId: executionChat.id,
          sequence: 3,
          timestamp: 1200,
          payload: { error: { name: 'Error', message: 'temporary' } }
        })
      }
    })
    expect(useChatStore.getState().getRunStatusForChat(executionChat.uuid).runPhase).toBe('idle')
    expect(useChatStore.getState().getRunStatusForChat(executionChat.uuid).lastRunOutcome).toBe('failed')
  })

  it('shows a failure notification from the terminal occurrence', async () => {
    await act(async () => {
      root.render(<Probe chatUuid="chat-1" />)
    })
    const task = buildTask({ id: 'task-other', chat_uuid: 'chat-2', goal: 'Recurring check' })
    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.RUN_FINISHED,
        payload: {
          task,
          run: {
            id: 'run-failed', task_id: task.id, scheduled_for: 1000, next_attempt_at: 1000,
            status: 'failed', attempt_count: 3, submission_id: 'submission-2', started_at: 1000,
            execution_chat_uuid: 'execution-2', finished_at: 2000, last_error: 'network error', result_message_id: null,
            created_at: 1000, updated_at: 2000
          }
        },
        chatUuid: 'chat-2', sequence: 3, timestamp: 2000
      })
    })
    expect(toast.error).toHaveBeenCalledWith('任务执行失败', { description: 'network error' })
  })

  it('keeps blocking post-run maintenance bound after occurrence completion', async () => {
    await act(async () => root.render(<Probe chatUuid="chat-1" />))
    const task = buildTask()
    const run = {
      id: 'run-post', task_id: task.id, scheduled_for: 1000, next_attempt_at: 1000,
      status: 'running' as const, attempt_count: 1, submission_id: 'submission-post',
      execution_chat_uuid: 'execution-post', started_at: 1000, finished_at: null,
      last_error: null, result_message_id: null, created_at: 1000, updated_at: 1000
    }

    await act(async () => {
      scheduleEventMock.handler?.({
        type: SCHEDULE_EVENTS.STARTED,
        payload: { task, run, submissionId: 'submission-post', attempt: 1 },
        chatUuid: 'execution-post', sequence: 1, timestamp: 1000
      })
      for (const handler of runEventMock.handlers) handler({
        type: RUN_MAINTENANCE_EVENTS.POSTRUN_PLAN,
        submissionId: 'submission-post', chatUuid: 'execution-post',
        sequence: 2, timestamp: 1001, payload: { title: 'skipped', compression: 'pending' }
      })
      for (const handler of runEventMock.handlers) handler({
        type: RUN_LIFECYCLE_EVENTS.RUN_COMPLETED,
        submissionId: 'submission-post', chatUuid: 'execution-post',
        sequence: 3, timestamp: 1002, payload: { assistantMessageId: 101 }
      })
    })
    expect(useChatStore.getState().getRunStatusForChat('execution-post').runPhase).toBe('post_run')

    await act(async () => scheduleEventMock.handler?.({
      type: SCHEDULE_EVENTS.RUN_FINISHED,
      payload: { task, run: { ...run, status: 'completed' } },
      chatUuid: 'execution-post', sequence: 4, timestamp: 1003
    }))
    expect(useChatStore.getState().getRunStatusForChat('execution-post').runPhase).toBe('post_run')

    await act(async () => {
      for (const handler of runEventMock.handlers) handler({
        type: RUN_MAINTENANCE_EVENTS.COMPRESSION_COMPLETED,
        submissionId: 'submission-post', chatUuid: 'execution-post',
        sequence: 5, timestamp: 1004, payload: { result: { success: true, summaryId: 1 } }
      })
    })
    expect(useChatStore.getState().getRunStatusForChat('execution-post').runPhase).toBe('idle')
    expect(runEventMock.handlers.size).toBe(0)
  })
})
