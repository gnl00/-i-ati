import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskRow } from '@main/db/dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { SchedulerService } from '../SchedulerService'
import DatabaseService from '@main/db/DatabaseService'
import { planningDb } from '@main/db/planning'

const taskStore: ScheduledTaskRow[] = []
const { mockSubmit, mockHasActiveRunForChat, mockScheduleEmit } = vi.hoisted(() => ({
  mockSubmit: vi.fn().mockResolvedValue({ assistantMessageId: 42 }),
  mockHasActiveRunForChat: vi.fn(() => false),
  mockScheduleEmit: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: vi.fn((chatUuid: string) => ({
      id: 1,
      uuid: chatUuid,
      modelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      }
    })),
    saveMessage: vi.fn(() => 123),
    getMessageById: vi.fn((id: number) => ({
      id,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: 'scheduled response',
        source: 'schedule'
      }
    })),
    getConfig: vi.fn(() => ({
      accounts: [
        {
          id: 'account-1',
          label: 'default',
          apiUrl: 'https://example.com/v1',
          apiKey: 'test',
          models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
        },
        {
          id: 'account-lite',
          label: 'lite',
          apiUrl: 'https://example.com/v1',
          apiKey: 'test',
          models: [{ id: 'model-lite', label: 'model-lite', type: 'llm' }]
        }
      ],
      tools: {
        liteModel: {
          accountId: 'account-lite',
          modelId: 'model-lite'
        }
      }
    })),
    saveRunEvent: vi.fn(() => 1),
  }
}))

vi.mock('@main/db/planning', () => ({
  planningDb: {
    saveScheduledTask: vi.fn((task: ScheduledTaskRow) => {
      taskStore.push({ ...task })
    }),
    claimDueScheduledTasks: vi.fn((now: number, limit: number) => {
      return taskStore
        .filter(task => task.status === 'pending' && task.run_at <= now)
        .slice(0, limit)
        .map(task => ({ ...task }))
    }),
    getScheduledTaskById: vi.fn((id: string) => {
      const task = taskStore.find(item => item.id === id)
      return task ? { ...task } : undefined
    }),
    getScheduledTasksByStatus: vi.fn((status: ScheduleTaskStatus, limit: number) => {
      return taskStore
        .filter(task => task.status === status)
        .sort((left, right) => left.run_at - right.run_at)
        .slice(0, limit)
        .map(task => ({ ...task }))
    }),
    updateScheduledTaskStatus: vi.fn(
      (id: string, status: ScheduleTaskStatus, attemptCount: number, lastError?: string, resultMessageId?: number) => {
        const task = taskStore.find(item => item.id === id)
        if (!task) return
        task.status = status
        task.attempt_count = attemptCount
        task.last_error = lastError ?? null
        task.result_message_id = resultMessageId ?? null
        task.updated_at = Date.now()
      }
    )
  }
}))

vi.mock('@main/services/scheduler/event-emitter', () => ({
  ScheduleEventEmitter: class {
    emit = mockScheduleEmit
  }
}))

vi.mock('@main/orchestration/chat/run', () => ({
  RunService: class {
    execute = mockSubmit
    hasActiveRunForChat = mockHasActiveRunForChat
  }
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

const buildTask = (overrides: Partial<ScheduledTaskRow> = {}): ScheduledTaskRow => {
  const now = Date.now()
  return {
    id: 'task-1',
    chat_uuid: 'chat-1',
    plan_id: null,
    goal: 'run scheduled task',
    run_at: now - 1000,
    timezone: null,
    status: 'pending',
    payload: null,
    attempt_count: 0,
    max_attempts: 3,
    last_error: null,
    result_message_id: null,
    created_at: now,
    updated_at: now,
    ...overrides
  }
}

describe('SchedulerService', () => {
  beforeEach(() => {
    vi.useRealTimers()
    taskStore.length = 0
    mockSubmit.mockClear()
    mockScheduleEmit.mockClear()
    mockHasActiveRunForChat.mockReset()
    mockHasActiveRunForChat.mockReturnValue(false)
    vi.clearAllMocks()
  })

  it('adds a scheduled task and triggers it when due', async () => {
    const dueTask = buildTask()
    planningDb.saveScheduledTask(dueTask)

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(planningDb.claimDueScheduledTasks).toHaveBeenCalledTimes(1)
    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      1,
      dueTask.id,
      'running',
      1,
      undefined,
      undefined
    )
    expect(mockScheduleEmit).toHaveBeenCalledWith(
      SCHEDULE_EVENTS.STARTED,
      expect.objectContaining({
        task: expect.objectContaining({
          id: dueTask.id,
          status: 'running',
          attempt_count: 1
        }),
        submissionId: expect.any(String),
        attempt: 1
      })
    )
    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      2,
      dueTask.id,
      'completed',
      1,
      undefined,
      42
    )
    expect(DatabaseService.saveMessage).not.toHaveBeenCalled()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledWith(expect.objectContaining({
      modelRef: {
        accountId: 'account-lite',
        modelId: 'model-lite'
      },
      chatModelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      },
      input: expect.objectContaining({
        textCtx: dueTask.goal,
        mediaCtx: [],
        source: 'schedule',
        stream: true
      })
    }))
    expect(taskStore[0].status).toBe('completed')
    expect(taskStore[0].attempt_count).toBe(1)
  })

  it('does not trigger tasks that are not due yet', async () => {
    const futureTask = buildTask({
      id: 'task-future',
      run_at: Date.now() + 60_000
    })
    planningDb.saveScheduledTask(futureTask)

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(planningDb.updateScheduledTaskStatus).not.toHaveBeenCalled()
    expect(taskStore[0].status).toBe('pending')
  })

  it('skips due tasks when the chat already has an active run', async () => {
    const dueTask = buildTask({
      id: 'task-busy-chat'
    })
    planningDb.saveScheduledTask(dueTask)
    mockHasActiveRunForChat.mockReturnValue(true)

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(mockHasActiveRunForChat).toHaveBeenCalledWith('chat-1')
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(planningDb.updateScheduledTaskStatus).not.toHaveBeenCalled()
    expect(taskStore[0].status).toBe('pending')
    expect(taskStore[0].attempt_count).toBe(0)
  })

  it('retries as pending when execution fails and attempts remain', async () => {
    const failingTask = buildTask({
      id: 'task-fail-retry',
      max_attempts: 3
    })
    planningDb.saveScheduledTask(failingTask)

    ;(planningDb.updateScheduledTaskStatus as any).mockImplementation(
      (id: string, status: ScheduleTaskStatus, attemptCount: number, lastError?: string, resultMessageId?: number) => {
        if (id === 'task-fail-retry' && status === 'completed') {
          throw new Error('simulated completion failure')
        }
        const task = taskStore.find(item => item.id === id)
        if (!task) return
        task.status = status
        task.attempt_count = attemptCount
        task.last_error = lastError ?? null
        task.result_message_id = resultMessageId ?? null
        task.updated_at = Date.now()
      }
    )

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      1,
      failingTask.id,
      'running',
      1,
      undefined,
      undefined
    )
    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      2,
      failingTask.id,
      'completed',
      1,
      undefined,
      42
    )
    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      3,
      failingTask.id,
      'pending',
      1,
      'simulated completion failure',
      undefined
    )
    expect(taskStore[0].status).toBe('pending')
    expect(taskStore[0].attempt_count).toBe(1)
    expect(taskStore[0].last_error).toBe('simulated completion failure')
  })

  it('marks failed directly when max_attempts is 0', async () => {
    const noRetryTask = buildTask({
      id: 'task-no-retry',
      max_attempts: 0
    })
    planningDb.saveScheduledTask(noRetryTask)

    ;(planningDb.updateScheduledTaskStatus as any).mockImplementation(
      (id: string, status: ScheduleTaskStatus, attemptCount: number, lastError?: string, resultMessageId?: number) => {
        if (id === 'task-no-retry' && status === 'completed') {
          throw new Error('forced failure no-retry')
        }
        const task = taskStore.find(item => item.id === id)
        if (!task) return
        task.status = status
        task.attempt_count = attemptCount
        task.last_error = lastError ?? null
        task.result_message_id = resultMessageId ?? null
        task.updated_at = Date.now()
      }
    )

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(planningDb.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      3,
      noRetryTask.id,
      'failed',
      1,
      'forced failure no-retry',
      undefined
    )
    expect(taskStore[0].status).toBe('failed')
  })

  it('uses a due timer to trigger the next pending task before the fallback interval', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-19T10:00:00.000Z'))
    const futureTask = buildTask({
      id: 'task-next-due',
      run_at: Date.now() + 5000
    })
    planningDb.saveScheduledTask(futureTask)

    const scheduler = new SchedulerService()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(4999)

    expect(mockSubmit).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(planningDb.getScheduledTasksByStatus).toHaveBeenCalledWith('pending', 1)
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(taskStore[0].status).toBe('completed')
    scheduler.stop()
  })
})
