import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScheduledTaskDao, type ScheduledTaskRow, type ScheduledTaskRunRow } from '../ScheduledTaskDao'

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
        submission_id TEXT, started_at INTEGER, finished_at INTEGER, last_error TEXT,
        result_message_id INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, scheduled_for)
      );
      CREATE UNIQUE INDEX one_active ON scheduled_task_runs(task_id) WHERE status IN ('pending','running');
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
    status: 'pending', attempt_count: 0, submission_id: null, started_at: null, finished_at: null,
    last_error: null, result_message_id: null, created_at: scheduledFor, updated_at: scheduledFor
  })

  it('claims each due occurrence once with a conditional update', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    expect(dao.claimDueRuns(1000, 5)).toHaveLength(1)
    expect(dao.claimDueRuns(1000, 5)).toHaveLength(0)
    expect(dao.getRunById('run-1')?.status).toBe('running')
  })

  it('returns the active submission while cancelling task and occurrence', () => {
    dao.insertTaskWithRun(task(), run('run-1', 'task-1', 1000))
    dao.claimDueRuns(1000, 1)
    dao.startRunAttempt('run-1', 'submission-1', 1000)
    expect(dao.cancelTask('task-1', 'cancelled', 1100)).toEqual({ submissionId: 'submission-1' })
    expect(dao.getById('task-1')?.status).toBe('cancelled')
    expect(dao.getRunById('run-1')?.status).toBe('cancelled')
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
