import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskRow } from '@main/db/repositories/ScheduledTaskRepository'
import { SchedulerService } from '../SchedulerService'
import DatabaseService from '@main/services/DatabaseService'

const taskStore: ScheduledTaskRow[] = []
const { mockSubmit } = vi.hoisted(() => ({
  mockSubmit: vi.fn().mockResolvedValue({ assistantMessageId: 42 })
}))

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    saveScheduledTask: vi.fn((task: ScheduledTaskRow) => {
      taskStore.push({ ...task })
    }),
    claimDueScheduledTasks: vi.fn((now: number, limit: number) => {
      return taskStore
        .filter(task => task.status === 'pending' && task.run_at <= now)
        .slice(0, limit)
        .map(task => ({ ...task }))
    }),
    getChatByUuid: vi.fn((chatUuid: string) => ({
      id: 1,
      uuid: chatUuid,
      model: 'model-1'
    })),
    saveMessage: vi.fn(() => 123),
    getConfig: vi.fn(() => ({
      accounts: [
        {
          id: 'account-1',
          label: 'default',
          apiUrl: 'https://example.com/v1',
          apiKey: 'test',
          models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
        }
      ]
    })),
    getScheduledTaskById: vi.fn((id: string) => {
      const task = taskStore.find(item => item.id === id)
      return task ? { ...task } : undefined
    }),
    saveChatSubmitEvent: vi.fn(() => 1),
    updateScheduledTaskStatus: vi.fn(
      (id: string, status: string, attemptCount: number, lastError?: string, resultMessageId?: number) => {
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

vi.mock('@main/services/chatSubmit/event-emitter', () => ({
  ChatSubmitEventEmitter: class {
    emit = vi.fn()
  }
}))

vi.mock('@main/services/chatSubmit', () => ({
  MainChatSubmitService: class {
    submit = mockSubmit
  }
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
    taskStore.length = 0
    mockSubmit.mockClear()
    vi.clearAllMocks()
  })

  it('adds a scheduled task and triggers it when due', async () => {
    const dueTask = buildTask()
    DatabaseService.saveScheduledTask(dueTask)

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(DatabaseService.claimDueScheduledTasks).toHaveBeenCalledTimes(1)
    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      1,
      dueTask.id,
      'running',
      1,
      undefined,
      undefined
    )
    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      2,
      dueTask.id,
      'completed',
      1,
      undefined,
      42
    )
    expect(DatabaseService.saveMessage).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(taskStore[0].status).toBe('completed')
    expect(taskStore[0].attempt_count).toBe(1)
  })

  it('does not trigger tasks that are not due yet', async () => {
    const futureTask = buildTask({
      id: 'task-future',
      run_at: Date.now() + 60_000
    })
    DatabaseService.saveScheduledTask(futureTask)

    const scheduler = new SchedulerService()
    await (scheduler as any).tick()

    expect(DatabaseService.updateScheduledTaskStatus).not.toHaveBeenCalled()
    expect(taskStore[0].status).toBe('pending')
  })

  it('retries as pending when execution fails and attempts remain', async () => {
    const failingTask = buildTask({
      id: 'task-fail-retry',
      max_attempts: 3
    })
    DatabaseService.saveScheduledTask(failingTask)

    ;(DatabaseService.updateScheduledTaskStatus as any).mockImplementation(
      (id: string, status: string, attemptCount: number, lastError?: string, resultMessageId?: number) => {
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

    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      1,
      failingTask.id,
      'running',
      1,
      undefined,
      undefined
    )
    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      2,
      failingTask.id,
      'completed',
      1,
      undefined,
      42
    )
    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
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
    DatabaseService.saveScheduledTask(noRetryTask)

    ;(DatabaseService.updateScheduledTaskStatus as any).mockImplementation(
      (id: string, status: string, attemptCount: number, lastError?: string, resultMessageId?: number) => {
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

    expect(DatabaseService.updateScheduledTaskStatus).toHaveBeenNthCalledWith(
      3,
      noRetryTask.id,
      'failed',
      1,
      'forced failure no-retry',
      undefined
    )
    expect(taskStore[0].status).toBe('failed')
  })
})
