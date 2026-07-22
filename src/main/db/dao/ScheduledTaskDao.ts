import type Database from 'better-sqlite3'
import type {
  ScheduleRunStatus,
  ScheduleTaskStatus,
  ScheduleType
} from '@shared/tools/schedule'

export interface ScheduledTaskRow {
  id: string
  chat_uuid: string
  plan_id: string | null
  goal: string
  schedule_type: ScheduleType
  cron_expression: string | null
  run_at: number
  timezone: string | null
  status: ScheduleTaskStatus
  payload: string | null
  max_attempts: number
  last_run_at: number | null
  last_run_status: ScheduleRunStatus | null
  run_count: number
  last_error: string | null
  result_message_id: number | null
  created_at: number
  updated_at: number
}

export interface ScheduledTaskRunRow {
  id: string
  task_id: string
  scheduled_for: number
  next_attempt_at: number
  status: ScheduleRunStatus
  attempt_count: number
  submission_id: string | null
  started_at: number | null
  finished_at: number | null
  last_error: string | null
  result_message_id: number | null
  created_at: number
  updated_at: number
}

export type ClaimedScheduledRun = { task: ScheduledTaskRow; run: ScheduledTaskRunRow }

export class ScheduledTaskDao {
  constructor(private readonly db: Database.Database) {}

  insertTask(row: ScheduledTaskRow): void {
    this.db.prepare(`INSERT INTO scheduled_tasks (
      id, chat_uuid, plan_id, goal, schedule_type, cron_expression, run_at, timezone,
      status, payload, max_attempts, last_run_at, last_run_status, run_count,
      last_error, result_message_id, created_at, updated_at
    ) VALUES (
      @id, @chat_uuid, @plan_id, @goal, @schedule_type, @cron_expression, @run_at, @timezone,
      @status, @payload, @max_attempts, @last_run_at, @last_run_status, @run_count,
      @last_error, @result_message_id, @created_at, @updated_at
    )`).run(row)
  }

  insertTaskWithRun(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void {
    this.db.transaction(() => {
      this.insertTask(task)
      this.insertRun(run)
    })()
  }

  updateTask(row: ScheduledTaskRow): void {
    this.db.prepare(`UPDATE scheduled_tasks SET
      chat_uuid=@chat_uuid, plan_id=@plan_id, goal=@goal, schedule_type=@schedule_type,
      cron_expression=@cron_expression, run_at=@run_at, timezone=@timezone, status=@status,
      payload=@payload, max_attempts=@max_attempts, last_run_at=@last_run_at,
      last_run_status=@last_run_status, run_count=@run_count, last_error=@last_error,
      result_message_id=@result_message_id, updated_at=@updated_at WHERE id=@id
    `).run(row)
  }

  replacePendingRun(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void {
    this.db.transaction(() => {
      this.updateTask(task)
      this.db.prepare("DELETE FROM scheduled_task_runs WHERE task_id = ? AND status = 'pending'").run(task.id)
      this.insertRun(run)
    })()
  }

  getById(id: string): ScheduledTaskRow | undefined {
    return this.db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as ScheduledTaskRow | undefined
  }

  getByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return this.db.prepare('SELECT * FROM scheduled_tasks WHERE chat_uuid = ? ORDER BY run_at ASC').all(chatUuid) as ScheduledTaskRow[]
  }

  listAll(): ScheduledTaskRow[] {
    return this.db.prepare('SELECT * FROM scheduled_tasks ORDER BY run_at ASC').all() as ScheduledTaskRow[]
  }

  listByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    return this.db.prepare('SELECT * FROM scheduled_tasks WHERE status = ? ORDER BY run_at ASC LIMIT ?').all(status, limit) as ScheduledTaskRow[]
  }

  getRunById(id: string): ScheduledTaskRunRow | undefined {
    return this.db.prepare('SELECT * FROM scheduled_task_runs WHERE id = ?').get(id) as ScheduledTaskRunRow | undefined
  }

  getActiveRunByTaskId(taskId: string): ScheduledTaskRunRow | undefined {
    return this.db.prepare("SELECT * FROM scheduled_task_runs WHERE task_id = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1").get(taskId) as ScheduledTaskRunRow | undefined
  }

  listRunsByTaskId(taskId: string, limit = 100): ScheduledTaskRunRow[] {
    return this.db.prepare('SELECT * FROM scheduled_task_runs WHERE task_id = ? ORDER BY scheduled_for DESC LIMIT ?').all(taskId, limit) as ScheduledTaskRunRow[]
  }

  claimDueRuns(now: number, limit: number): ClaimedScheduledRun[] {
    return this.db.transaction(() => {
      const candidates = this.db.prepare(`SELECT r.id FROM scheduled_task_runs r
        JOIN scheduled_tasks t ON t.id = r.task_id
        WHERE r.status = 'pending' AND r.next_attempt_at <= ? AND t.status = 'pending'
        ORDER BY r.next_attempt_at ASC LIMIT ?`).all(now, limit) as Array<{ id: string }>
      const claimed: ClaimedScheduledRun[] = []
      for (const candidate of candidates) {
        const result = this.db.prepare("UPDATE scheduled_task_runs SET status='running', updated_at=? WHERE id=? AND status='pending' AND next_attempt_at<=?").run(now, candidate.id, now)
        if (result.changes !== 1) continue
        const run = this.getRunById(candidate.id)
        if (!run) continue
        this.db.prepare("UPDATE scheduled_tasks SET status='running', updated_at=? WHERE id=? AND status='pending'").run(now, run.task_id)
        const task = this.getById(run.task_id)
        if (task) claimed.push({ task, run })
      }
      return claimed
    })()
  }

  startRunAttempt(runId: string, submissionId: string, now: number): ScheduledTaskRunRow | undefined {
    this.db.prepare(`UPDATE scheduled_task_runs SET attempt_count=attempt_count+1,
      submission_id=?, started_at=?, updated_at=? WHERE id=? AND status='running'`).run(submissionId, now, now, runId)
    return this.getRunById(runId)
  }

  deferRun(runId: string, nextAttemptAt: number, now: number): void {
    this.db.transaction(() => {
      const run = this.getRunById(runId)
      if (!run) return
      this.db.prepare("UPDATE scheduled_task_runs SET status='pending', next_attempt_at=?, submission_id=NULL, started_at=NULL, updated_at=? WHERE id=? AND status='running'").run(nextAttemptAt, now, runId)
      this.db.prepare("UPDATE scheduled_tasks SET status='pending', run_at=?, updated_at=? WHERE id=? AND status='running'").run(nextAttemptAt, now, run.task_id)
    })()
  }

  completeRun(runId: string, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void {
    this.finishRun(runId, 'completed', null, resultMessageId, nextRun, now)
  }

  failRun(runId: string, error: string, retryAt: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void {
    this.db.transaction(() => {
      const run = this.getRunById(runId)
      if (!run) return
      if (retryAt !== null) {
        this.db.prepare("UPDATE scheduled_task_runs SET status='pending', next_attempt_at=?, submission_id=NULL, last_error=?, updated_at=? WHERE id=?").run(retryAt, error, now, runId)
        this.db.prepare("UPDATE scheduled_tasks SET status='pending', run_at=?, last_error=?, updated_at=? WHERE id=?").run(retryAt, error, now, run.task_id)
        return
      }
      this.finishRunInTransaction(run, 'failed', error, null, nextRun, now)
    })()
  }

  cancelTask(taskId: string, reason: string, now: number): { submissionId: string | null } {
    return this.db.transaction(() => {
      const run = this.getActiveRunByTaskId(taskId)
      if (run && run.attempt_count > 0) {
        this.db.prepare("UPDATE scheduled_tasks SET status='cancelled', last_run_at=?, last_run_status='cancelled', run_count=run_count+1, last_error=?, updated_at=? WHERE id=?").run(run.scheduled_for, reason, now, taskId)
      } else {
        this.db.prepare("UPDATE scheduled_tasks SET status='cancelled', last_error=?, updated_at=? WHERE id=?").run(reason, now, taskId)
      }
      this.db.prepare("UPDATE scheduled_task_runs SET status='cancelled', finished_at=?, last_error=?, updated_at=? WHERE task_id=? AND status IN ('pending','running')").run(now, reason, now, taskId)
      this.trimHistory(taskId)
      return { submissionId: run?.submission_id ?? null }
    })()
  }

  dismissTask(taskId: string, now: number): void {
    this.db.prepare("UPDATE scheduled_tasks SET status='dismissed', updated_at=? WHERE id=?").run(now, taskId)
  }

  listRunningRuns(): ClaimedScheduledRun[] {
    const runs = this.db.prepare("SELECT * FROM scheduled_task_runs WHERE status='running'").all() as ScheduledTaskRunRow[]
    return runs.flatMap(run => {
      const task = this.getById(run.task_id)
      return task ? [{ task, run }] : []
    })
  }

  recoverInterruptedRun(runId: string, nextRun: ScheduledTaskRunRow | null, now: number): void {
    this.db.transaction(() => {
      const run = this.getRunById(runId)
      if (run) this.finishRunInTransaction(run, 'failed', 'Interrupted by application restart', null, nextRun, now)
    })()
  }

  deleteById(id: string): void {
    this.db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id)
  }

  private insertRun(row: ScheduledTaskRunRow): void {
    this.db.prepare(`INSERT INTO scheduled_task_runs (
      id, task_id, scheduled_for, next_attempt_at, status, attempt_count, submission_id,
      started_at, finished_at, last_error, result_message_id, created_at, updated_at
    ) VALUES (
      @id, @task_id, @scheduled_for, @next_attempt_at, @status, @attempt_count, @submission_id,
      @started_at, @finished_at, @last_error, @result_message_id, @created_at, @updated_at
    )`).run(row)
  }

  private finishRun(runId: string, status: 'completed' | 'failed', error: string | null, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void {
    this.db.transaction(() => {
      const run = this.getRunById(runId)
      if (run) this.finishRunInTransaction(run, status, error, resultMessageId, nextRun, now)
    })()
  }

  private finishRunInTransaction(run: ScheduledTaskRunRow, status: 'completed' | 'failed', error: string | null, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void {
    this.db.prepare(`UPDATE scheduled_task_runs SET status=?, finished_at=?, last_error=?,
      result_message_id=?, updated_at=? WHERE id=?`).run(status, now, error, resultMessageId, now, run.id)
    const task = this.getById(run.task_id)
    if (!task || task.status === 'cancelled') return
    const parentStatus: ScheduleTaskStatus = nextRun ? 'pending' : status
    const nextWake = nextRun?.next_attempt_at ?? task.run_at
    this.db.prepare(`UPDATE scheduled_tasks SET status=?, run_at=?, last_run_at=?,
      last_run_status=?, run_count=run_count+1, last_error=?, result_message_id=?, updated_at=? WHERE id=?
    `).run(parentStatus, nextWake, run.scheduled_for, status, error, resultMessageId, now, task.id)
    if (nextRun) this.insertRun(nextRun)
    this.trimHistory(task.id)
  }

  private trimHistory(taskId: string): void {
    this.db.prepare(`DELETE FROM scheduled_task_runs WHERE task_id=? AND status IN ('completed','failed','cancelled')
      AND id NOT IN (SELECT id FROM scheduled_task_runs WHERE task_id=? AND status IN ('completed','failed','cancelled') ORDER BY finished_at DESC LIMIT 100)
    `).run(taskId, taskId)
  }
}
