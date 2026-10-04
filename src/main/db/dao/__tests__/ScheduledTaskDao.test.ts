import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SCHEDULE_MISFIRE_GRACE_MS, ScheduledTaskDao, type ScheduledTaskRow, type ScheduledTaskRunRow } from '../ScheduledTaskDao'

const describeNative = process.versions.electron ? describe : describe.skip

describeNative('ScheduledTaskDao native SQLite integration', () => {
  let db: Database.Database
  let dao: ScheduledTaskDao

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE scheduled_tasks (
        id TEXT PRIMARY KEY, chat_uuid TEXT NOT NULL, plan_id TEXT, goal TEXT NOT NULL,
        schedule_type TEXT NOT NULL, cron_expression TEXT, run_at INTEGER NOT NULL, timezone TEXT,
        status TEXT NOT NULL, payload TEXT, max_attempts INTEGER NOT NULL,
        last_run_at INTEGER, last_run_status TEXT, run_count INTEGER NOT NULL,
        last_error TEXT, result_message_id INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE scheduled_task_runs (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_for INTEGER NOT NULL,
        next_attempt_at INTEGER NOT NULL, status TEXT NOT NULL, attempt_count INTEGER NOT NULL,
        submission_id TEXT, execution_chat_uuid TEXT, started_at INTEGER, finished_at INTEGER, last_error TEXT,
        result_message_id INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, scheduled_for)
      );
      CREATE UNIQUE INDEX one_active ON scheduled_task_runs(task_id) WHERE status IN ('pending','running');
      CREATE TABLE scheduled_task_run_attempts (
        run_id TEXT NOT NULL, attempt INTEGER NOT NULL, submission_id TEXT NOT NULL,
        chat_uuid TEXT NOT NULL, created_at INTEGER NOT NULL,
        FOREIGN KEY (run_id) REFERENCES scheduled_task_runs(id) ON DELETE CASCADE,
        UNIQUE(run_id, attempt)
      );
    `)
    dao = new ScheduledTaskDao(db)
  })

  afterEach(() => db?.close())

  const task = (id = 'task-1'): ScheduledTaskRow => ({
    id, chat_uuid: 'chat-1', plan_id: null, goal: 'run', schedule_type: 'once', cron_expression: null,
    run_at: 1000, timezone: null, status: 'pending', payload: null, max_attempts: 3,
    last_run_at: null, last_run_status: null, run_count: 0, last_error: null,
    result_message_id: null, created_at: 1, updated_at: 1
  })
  const run = (id: string, taskId: string, scheduledFor: number): ScheduledTaskRunRow => ({
    id, task_id: taskId, scheduled_for: scheduledFor, next_attempt_at: scheduledFor,
    status: 'pending', attempt_count: 0, submission_id: null, execution_chat_uuid: null, started_at: null, finished_at: null,
    last_error: null, result_message_id: null, created_at: scheduledFor, updated_at: scheduledFor
  })

  it('claims each due occurrence once with a conditional update', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    expect(dao.claimDueRuns(1000, 5)).toHaveLength(1)
    expect(dao.claimDueRuns(1000, 5)).toHaveLength(0)
    expect(dao.getRunById('run-1')?.status).toBe('running')
  })

  it('claims the 15-minute boundary and fresh retry deadlines while leaving stale runs pending', () => {
    const now = 1_000_000
    const boundary = now - SCHEDULE_MISFIRE_GRACE_MS
    dao.insertTaskWithRun(task('stale'), run('stale-run', 'stale', boundary - 1))
    dao.insertTaskWithRun(task('boundary'), run('boundary-run', 'boundary', boundary))
    dao.insertTaskWithRun(task('retry'), {
      ...run('retry-run', 'retry', 1000), attempt_count: 1, next_attempt_at: now
    })
    dao.insertTaskWithRun(task('future'), run('future-run', 'future', now + 1))

    expect(dao.claimDueRuns(now, 5).map(item => item.run.id)).toEqual(['boundary-run', 'retry-run'])
    expect(dao.getRunById('stale-run')?.status).toBe('pending')
    expect(dao.getById('stale')?.status).toBe('pending')
    expect(dao.getRunById('future-run')?.status).toBe('pending')
  })

  it('returns the active submission while cancelling task and occurrence', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    dao.claimDueRuns(1000, 1)
    dao.startRunAttempt('run-1', 'submission-1', 1000)
    expect(dao.cancelTask('task-1', 'cancelled', 1100)).toEqual({ submissionId: 'submission-1' })
    expect(dao.getById('task-1')?.status).toBe('cancelled')
    expect(dao.getRunById('run-1')?.status).toBe('cancelled')
  })

  it('binds each started attempt idempotently and retains its execution chat', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    dao.claimDueRuns(1000, 1)
    const started = dao.startRunAttempt('run-1', 'submission-1', 1000)!
    const bound = dao.bindRunAttempt('run-1', started.attempt_count, 'submission-1', 'execution-1', 1100)
    expect(bound).toMatchObject({ execution_chat_uuid: 'execution-1', attempt_count: 1 })
    expect(dao.bindRunAttempt('run-1', 1, 'submission-1', 'execution-1', 1200)).toMatchObject({ execution_chat_uuid: 'execution-1' })
    expect(dao.listRunAttempts('run-1')).toEqual([{
      run_id: 'run-1', attempt: 1, submission_id: 'submission-1', chat_uuid: 'execution-1', created_at: 1100
    }])
    expect(dao.bindRunAttempt('run-1', 1, 'submission-1', 'execution-2', 1300)).toBeUndefined()
  })

  it('retains prior attempt chats while rebinding the current retry', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    dao.claimDueRuns(1000, 1)
    const first = dao.startRunAttempt('run-1', 'submission-1', 1000)!
    dao.bindRunAttempt('run-1', first.attempt_count, 'submission-1', 'execution-1', 1100)
    dao.failRun('run-1', 'temporary', 2000, null, 1200)

    dao.claimDueRuns(2000, 1)
    const second = dao.startRunAttempt('run-1', 'submission-2', 2000)!
    const bound = dao.bindRunAttempt('run-1', second.attempt_count, 'submission-2', 'execution-2', 2100)

    expect(bound).toMatchObject({ attempt_count: 2, execution_chat_uuid: 'execution-2' })
    expect(dao.listRunAttempts('run-1')).toEqual([
      { run_id: 'run-1', attempt: 2, submission_id: 'submission-2', chat_uuid: 'execution-2', created_at: 2100 },
      { run_id: 'run-1', attempt: 1, submission_id: 'submission-1', chat_uuid: 'execution-1', created_at: 1100 }
    ])
  })

  it('requires a running row for start and cleans attempt associations with the run', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    expect(dao.startRunAttempt('run-1', 'submission-1', 1000)).toBeUndefined()
    dao.claimDueRuns(1000, 1)
    const started = dao.startRunAttempt('run-1', 'submission-1', 1000)!
    dao.bindRunAttempt('run-1', started.attempt_count, 'submission-1', 'execution-1', 1100)
    dao.deleteById('task-1')
    expect(dao.listRunAttempts('run-1')).toEqual([])
  })

  it('keeps run summary empty when cancelling a pending occurrence', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    expect(dao.cancelTask('task-1', 'cancelled', 900)).toEqual({ submissionId: null })
    expect(dao.getById('task-1')).toMatchObject({
      status: 'cancelled',
      last_run_at: null,
      last_run_status: null,
      run_count: 0
    })
  })

  it('finishes an expired one-time occurrence once without starting an attempt', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))

    dao.skipRun('run-1', 'Missed execution window', null, 1_000_000)
    dao.skipRun('run-1', 'Already skipped', null, 1_000_001)

    expect(dao.getRunById('run-1')).toMatchObject({
      status: 'skipped', attempt_count: 0, submission_id: null, execution_chat_uuid: null,
      last_error: 'Missed execution window', finished_at: 1_000_000
    })
    expect(dao.getById('task-1')).toMatchObject({
      status: 'skipped', run_count: 1, last_run_at: 1000, last_run_status: 'skipped',
      last_error: 'Missed execution window'
    })
    expect(dao.listRunAttempts('run-1')).toEqual([])
  })

  it('atomically skips a cron occurrence and installs its replacement', () => {
    const recurring = { ...task(), schedule_type: 'cron' as const, cron_expression: '* * * * *', timezone: 'UTC' }
    dao.insertTaskWithRun(recurring, run('run-1', recurring.id, 1000))

    dao.skipRun('run-1', 'Folded missed occurrences', run('run-2', recurring.id, 1_001_000), 1_000_000)

    expect(dao.getRunById('run-1')?.status).toBe('skipped')
    expect(dao.getActiveRunByTaskId(recurring.id)).toMatchObject({ id: 'run-2', status: 'pending' })
    expect(dao.getById(recurring.id)).toMatchObject({
      status: 'pending', run_at: 1_001_000, last_run_status: 'skipped', run_count: 1
    })

    expect(() => dao.skipRun('run-2', 'Invalid replacement', run('run-1', recurring.id, 1_002_000), 1_001_100)).toThrow()
    expect(dao.getRunById('run-2')?.status).toBe('pending')
    expect(dao.getById(recurring.id)).toMatchObject({ status: 'pending', run_at: 1_001_000, run_count: 1 })
  })

  it('summarizes the current failed attempt after a skipped cron occurrence without counting it twice', () => {
    const recurring = { ...task(), schedule_type: 'cron' as const, cron_expression: '* * * * *', timezone: 'UTC' }
    dao.insertTaskWithRun(recurring, run('run-1', recurring.id, 1000))
    dao.skipRun('run-1', 'Folded missed occurrences', run('run-2', recurring.id, 2000), 1500)
    dao.claimDueRuns(2000, 1)
    dao.startRunAttempt('run-2', 'submission-2', 2000)

    dao.failRun('run-2', 'Temporary failure', 3000, null, 2100)

    expect(dao.getRunById('run-2')).toMatchObject({ status: 'pending', attempt_count: 1, next_attempt_at: 3000 })
    expect(dao.getById(recurring.id)).toMatchObject({
      status: 'pending', run_at: 3000, last_run_at: 2000, last_run_status: 'failed',
      last_error: 'Temporary failure', run_count: 1
    })
    dao.claimDueRuns(3000, 1)
    dao.startRunAttempt('run-2', 'submission-3', 3000)
    dao.completeRun('run-2', 42, null, 3100)
    expect(dao.getById(recurring.id)).toMatchObject({ last_run_status: 'completed', run_count: 2 })
  })

  it.each(['running', 'cancelled'] as const)('preserves a %s occurrence when asked to skip it', (status) => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    if (status === 'running') dao.claimDueRuns(1000, 1)
    else dao.cancelTask('task-1', 'Cancelled by user', 1001)
    const originalTask = dao.getById('task-1')
    const originalRun = dao.getRunById('run-1')

    dao.skipRun('run-1', 'Missed execution window', run('run-2', 'task-1', 2000), 1500)

    expect(dao.getById('task-1')).toEqual(originalTask)
    expect(dao.getRunById('run-1')).toEqual(originalRun)
    expect(dao.getRunById('run-2')).toBeUndefined()
  })

  it('retains prior attempt associations and the chat reference when skipping an overdue retry', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    dao.claimDueRuns(1000, 1)
    dao.startRunAttempt('run-1', 'submission-1', 1000)
    dao.bindRunAttempt('run-1', 1, 'submission-1', 'execution-1', 1100)
    dao.failRun('run-1', 'Temporary failure', 2000, null, 1200)

    dao.skipRun('run-1', 'Missed retry window', null, 1_000_000)

    expect(dao.getRunById('run-1')).toMatchObject({
      status: 'skipped', attempt_count: 1, execution_chat_uuid: 'execution-1'
    })
    expect(dao.listRunAttempts('run-1')).toEqual([{
      run_id: 'run-1', attempt: 1, submission_id: 'submission-1', chat_uuid: 'execution-1', created_at: 1100
    }])
  })

  it('includes skipped occurrences in the latest 100 terminal history rows', () => {
    const recurring = { ...task(), schedule_type: 'cron' as const, cron_expression: '* * * * *', timezone: 'UTC' }
    dao.insertTaskWithRun(recurring, run('run-0', recurring.id, 1000))
    for (let index = 0; index < 105; index += 1) {
      const current = dao.getActiveRunByTaskId(recurring.id)!
      const next = index < 104 ? run(`run-${index + 1}`, recurring.id, current.scheduled_for + 1000) : null
      dao.skipRun(current.id, 'Missed execution window', next, current.scheduled_for + 1)
    }

    const history = dao.listRunsByTaskId(recurring.id, 200)
    expect(history).toHaveLength(100)
    expect(history.every(item => item.status === 'skipped')).toBe(true)
    expect(dao.getRunById('run-4')).toBeUndefined()
    expect(dao.getRunById('run-5')?.status).toBe('skipped')
  })

  it('retains the latest 100 terminal occurrences', () => {
    const recurring = { ...task(), schedule_type: 'cron' as const, cron_expression: '* * * * *', timezone: 'UTC' }
    dao.insertTaskWithRun(recurring, run('run-0', recurring.id, 1000))
    for (let index = 0; index < 105; index += 1) {
      const current = dao.getActiveRunByTaskId(recurring.id)!
      dao.claimDueRuns(current.next_attempt_at, 1)
      const next = index < 104 ? run(`run-${index + 1}`, recurring.id, current.scheduled_for + 1000) : null
      dao.completeRun(current.id, index, next, current.scheduled_for + 1)
    }
    expect(dao.listRunsByTaskId(recurring.id, 200)).toHaveLength(100)
  })
})
