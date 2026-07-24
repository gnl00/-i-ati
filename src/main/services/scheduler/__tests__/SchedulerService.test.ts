import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduledTaskRow, ScheduledTaskRunRow } from '@main/db/dao/ScheduledTaskDao'
import { calculateScheduleRetryDelay, SchedulerService } from '../SchedulerService'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { planningDb } from '@main/db/planning'

const tasks: ScheduledTaskRow[] = []
const runs: ScheduledTaskRunRow[] = []
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  busy: vi.fn(),
  cancel: vi.fn(),
  emit: vi.fn(),
  getChat: vi.fn(),
  notifyTerminalRunFailure: vi.fn()
}))

vi.mock('@main/db/chat', () => ({ chatDb: {
  getChatByUuid: mocks.getChat,
  getMessageById: vi.fn((id: number) => ({ id, chatId: 1, chatUuid: 'chat-1', body: { role: 'assistant', content: 'done' } }))
} }))
vi.mock('@main/db/config', () => ({ configDb: { getConfig: vi.fn(() => undefined) } }))
vi.mock('@main/notifications/AgentNotificationSink', () => ({
  notifyTerminalRunFailure: mocks.notifyTerminalRunFailure
}))
vi.mock('@main/orchestration/chat/run', () => ({ RunService: class {
  execute = mocks.execute
  hasActiveRunForChat = mocks.busy
  cancel = mocks.cancel
} }))
vi.mock('@main/logging/LogService', () => ({ createSchedulerLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }))
vi.mock('@main/services/scheduler/event-emitter', () => ({ ScheduleEventEmitter: class { emit = mocks.emit } }))
vi.mock('@main/db/planning', () => ({ planningDb: {
  claimDueScheduledTaskRuns: vi.fn((now: number, limit: number) => runs.filter(run => run.status === 'pending' && run.next_attempt_at <= now).slice(0, limit).map(run => {
    run.status = 'running'; const task = tasks.find(item => item.id === run.task_id)!; task.status = 'running'; return { task: { ...task }, run: { ...run } }
  })),
  startScheduledTaskRunAttempt: vi.fn((id: string, submissionId: string, now: number) => {
    const run = runs.find(item => item.id === id); if (!run) return undefined
    run.attempt_count += 1; run.submission_id = submissionId; run.started_at = now; return { ...run }
  }),
  deferScheduledTaskRun: vi.fn((id: string, next: number) => {
    const run = runs.find(item => item.id === id)!; run.status = 'pending'; run.next_attempt_at = next
    const task = tasks.find(item => item.id === run.task_id)!; task.status = 'pending'; task.run_at = next
  }),
  completeScheduledTaskRun: vi.fn((id: string, messageId: number | null, nextRun: ScheduledTaskRunRow | null) => {
    const run = runs.find(item => item.id === id)!; run.status = 'completed'; run.result_message_id = messageId
    const task = tasks.find(item => item.id === run.task_id)!; task.run_count += 1; task.last_run_status = 'completed'; task.status = nextRun ? 'pending' : 'completed'
    if (nextRun) { task.run_at = nextRun.next_attempt_at; runs.push(nextRun) }
  }),
  failScheduledTaskRun: vi.fn((id: string, error: string, retryAt: number | null, nextRun: ScheduledTaskRunRow | null) => {
    const run = runs.find(item => item.id === id)!; const task = tasks.find(item => item.id === run.task_id)!
    run.last_error = error
    if (retryAt) { run.status = 'pending'; run.next_attempt_at = retryAt; task.status = 'pending'; task.run_at = retryAt }
    else { run.status = 'failed'; task.run_count += 1; task.last_run_status = 'failed'; task.status = nextRun ? 'pending' : 'failed'; if (nextRun) { task.run_at = nextRun.next_attempt_at; runs.push(nextRun) } }
    task.last_error = error
  }),
  getScheduledTaskById: vi.fn((id: string) => tasks.find(item => item.id === id)),
  getScheduledTaskRuns: vi.fn((taskId: string) => runs.filter(item => item.task_id === taskId)),
  getScheduledTasksByStatus: vi.fn((status: string, limit: number) => tasks.filter(item => item.status === status).sort((a, b) => a.run_at - b.run_at).slice(0, limit)),
  listRunningScheduledTaskRuns: vi.fn(() => []),
  cancelScheduledTask: vi.fn((taskId: string) => {
    const task = tasks.find(item => item.id === taskId)!; const run = runs.find(item => item.task_id === taskId && ['pending', 'running'].includes(item.status))
    task.status = 'cancelled'; if (run) run.status = 'cancelled'
    return { submissionId: run?.submission_id ?? null }
  }),
  dismissScheduledTask: vi.fn(),
  recoverScheduledTaskRun: vi.fn()
} }))

function addTask(overrides: Partial<ScheduledTaskRow> = {}): ScheduledTaskRow {
  const now = Date.now()
  const task: ScheduledTaskRow = {
    id: `task-${tasks.length + 1}`, chat_uuid: 'chat-1', plan_id: null, goal: 'run', schedule_type: 'once',
    cron_expression: null, run_at: now - 1000, timezone: null, status: 'pending', payload: null,
    max_attempts: 3, last_run_at: null, last_run_status: null, run_count: 0, last_error: null,
    result_message_id: null, created_at: now, updated_at: now, ...overrides
  }
  tasks.push(task)
  runs.push({
    id: `run-${runs.length + 1}`, task_id: task.id, scheduled_for: task.run_at, next_attempt_at: task.run_at,
    status: 'pending', attempt_count: 0, submission_id: null, started_at: null, finished_at: null,
    last_error: null, result_message_id: null, created_at: now, updated_at: now
  })
  return task
}

describe('SchedulerService', () => {
  beforeEach(() => {
    tasks.length = 0; runs.length = 0
    vi.useFakeTimers(); vi.setSystemTime('2026-07-22T00:00:00Z')
    mocks.execute.mockReset().mockResolvedValue({ userMessageId: 41, assistantMessageId: 42 })
    mocks.busy.mockReset().mockReturnValue(false)
    mocks.getChat.mockReset().mockImplementation((uuid: string) => ({
      id: 1,
      uuid,
      title: 'Scheduled chat',
      modelRef: { accountId: 'a', modelId: 'm' }
    }))
    vi.clearAllMocks()
  })

  it('uses 30/60/120 second backoff with a 15 minute cap', () => {
    expect([1, 2, 3, 10].map(calculateScheduleRetryDelay)).toEqual([30_000, 60_000, 120_000, 900_000])
  })

  it('completes a one-time occurrence', async () => {
    const task = addTask()
    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()
    expect(task.status).toBe('completed')
    expect(runs[0]).toMatchObject({ status: 'completed', attempt_count: 1, result_message_id: 42 })
    expect(mocks.emit).toHaveBeenCalledWith(SCHEDULE_EVENTS.RUN_FINISHED, expect.objectContaining({ run: expect.objectContaining({ id: runs[0].id }) }))
  })

  it('advances a recurring schedule to one future occurrence', async () => {
    const task = addTask({ schedule_type: 'cron', cron_expression: '0 * * * *', timezone: 'UTC' })
    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()
    expect(task.status).toBe('pending')
    expect(runs.filter(run => run.status === 'pending')).toHaveLength(1)
    expect(new Date(task.run_at).toISOString()).toBe('2026-07-22T01:00:00.000Z')
  })

  it('uses the exact due timer before the fallback interval', async () => {
    const task = addTask({ run_at: Date.now() + 5000 })
    const scheduler = new SchedulerService()
    scheduler.start(10_000)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(4999)
    expect(mocks.execute).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(task.status).toBe('completed')
    scheduler.stop()
  })

  it('defers a busy chat without consuming an attempt', async () => {
    addTask(); mocks.busy.mockReturnValue(true)
    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()
    expect(runs[0]).toMatchObject({ status: 'pending', attempt_count: 0, next_attempt_at: Date.now() + 30_000 })
  })

  it('retries with exponential backoff', async () => {
    addTask(); mocks.execute.mockRejectedValue(new Error('temporary'))
    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()
    expect(runs[0]).toMatchObject({ status: 'pending', attempt_count: 1, next_attempt_at: Date.now() + 30_000 })
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        source: 'schedule',
        nativeNotification: expect.objectContaining({
          notifyOnFailure: false,
          occurrenceKey: runs[0].id
        })
      })
    }))
  })

  it('continues cron after its final failed attempt', async () => {
    const task = addTask({ schedule_type: 'cron', cron_expression: '0 * * * *', timezone: 'UTC', max_attempts: 1 })
    mocks.execute.mockRejectedValue(new Error('final'))
    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()
    expect(runs[0].status).toBe('failed')
    expect(task.status).toBe('pending')
    expect(runs.filter(run => run.status === 'pending')).toHaveLength(1)
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        source: 'schedule',
        nativeNotification: expect.objectContaining({
          notifyOnFailure: true,
          occurrenceKey: runs[0].id
        })
      })
    }))
  })

  it('notifies a terminal failure before runtime execution when the chat is missing', async () => {
    const task = addTask({ goal: 'Missing chat task', max_attempts: 1 })
    mocks.getChat.mockReturnValue(undefined)

    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(runs[0]).toMatchObject({
      status: 'failed',
      attempt_count: 1,
      last_error: 'Chat not found for chat_uuid=chat-1'
    })
    expect(mocks.emit).toHaveBeenCalledWith(
      SCHEDULE_EVENTS.RUN_FINISHED,
      expect.objectContaining({ run: expect.objectContaining({ id: runs[0].id }) })
    )
    expect(mocks.notifyTerminalRunFailure).toHaveBeenCalledOnce()
    expect(mocks.notifyTerminalRunFailure).toHaveBeenCalledWith({
      title: task.goal,
      body: 'Chat not found for chat_uuid=chat-1',
      occurrenceKey: runs[0].id
    })
  })

  it('settles a claimed run when the chat lookup throws', async () => {
    const task = addTask({ goal: 'Chat lookup task', max_attempts: 1 })
    mocks.getChat.mockImplementation(() => {
      throw new Error('chat database unavailable')
    })

    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()

    expect(mocks.execute).not.toHaveBeenCalled()
    expect(runs[0]).toMatchObject({
      status: 'failed',
      attempt_count: 0,
      last_error: 'chat database unavailable'
    })
    expect(mocks.notifyTerminalRunFailure).toHaveBeenCalledWith({
      title: task.goal,
      body: 'chat database unavailable',
      occurrenceKey: runs[0].id
    })
  })

  it('keeps the execution failure fallback silent after execution succeeds', async () => {
    addTask({
      schedule_type: 'cron',
      cron_expression: null,
      timezone: null,
      max_attempts: 1
    })

    await (new SchedulerService() as unknown as { tick(): Promise<void> }).tick()

    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(runs[0].status).toBe('failed')
    expect(mocks.notifyTerminalRunFailure).not.toHaveBeenCalled()
  })

  it('cancels the active RunService submission', () => {
    const task = addTask({ status: 'running' })
    runs[0].status = 'running'
    runs[0].submission_id = 'submission-active'
    const scheduler = new SchedulerService()
    scheduler.cancelTask(task.id)
    expect(mocks.cancel).toHaveBeenCalledWith('submission-active')
    expect(task.status).toBe('cancelled')
    expect(runs[0].status).toBe('cancelled')
  })

  it('preserves cancellation when an active execution settles', async () => {
    let resolveExecution!: (result: { userMessageId: number; assistantMessageId: number }) => void
    mocks.execute.mockReturnValue(new Promise(resolve => {
      resolveExecution = resolve
    }))
    const task = addTask()
    const scheduler = new SchedulerService()
    const tick = (scheduler as unknown as { tick(): Promise<void> }).tick()

    scheduler.cancelTask(task.id)
    resolveExecution({ userMessageId: 41, assistantMessageId: 42 })
    await tick

    expect(task.status).toBe('cancelled')
    expect(planningDb.completeScheduledTaskRun).not.toHaveBeenCalled()
  })

  it('records an interrupted one-time occurrence during startup recovery', () => {
    const task = addTask({ status: 'running' })
    runs[0].status = 'running'
    vi.mocked(planningDb.listRunningScheduledTaskRuns).mockReturnValueOnce([{ task, run: runs[0] }])
    ;(new SchedulerService() as unknown as { recoverInterruptedRuns(): void }).recoverInterruptedRuns()
    expect(planningDb.recoverScheduledTaskRun).toHaveBeenCalledWith(runs[0].id, null, Date.now())
  })
})
