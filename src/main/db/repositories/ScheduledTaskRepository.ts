import type Database from 'better-sqlite3'

export interface ScheduledTaskRow {
  id: string
  chat_uuid: string
  plan_id: string | null
  goal: string
  run_at: number
  timezone: string | null
  status: string
  payload: string | null
  attempt_count: number
  max_attempts: number
  last_error: string | null
  result_message_id: number | null
  created_at: number
  updated_at: number
}

class ScheduledTaskRepository {
  private stmts: {
    insertTask: Database.Statement
    updateTask: Database.Statement
    updateStatus: Database.Statement
    getById: Database.Statement
    getByChatUuid: Database.Statement
    listByStatus: Database.Statement
    deleteById: Database.Statement
    claimDueTasks: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertTask: db.prepare(`
        INSERT INTO scheduled_tasks (
          id, chat_uuid, plan_id, goal, run_at, timezone, status, payload,
          attempt_count, max_attempts, last_error, result_message_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateTask: db.prepare(`
        UPDATE scheduled_tasks SET
          chat_uuid = ?,
          plan_id = ?,
          goal = ?,
          run_at = ?,
          timezone = ?,
          status = ?,
          payload = ?,
          attempt_count = ?,
          max_attempts = ?,
          last_error = ?,
          result_message_id = ?,
          updated_at = ?
        WHERE id = ?
      `),
      updateStatus: db.prepare(`
        UPDATE scheduled_tasks SET
          status = ?,
          attempt_count = ?,
          last_error = ?,
          result_message_id = ?,
          updated_at = ?
        WHERE id = ?
      `),
      getById: db.prepare(`
        SELECT * FROM scheduled_tasks WHERE id = ?
      `),
      getByChatUuid: db.prepare(`
        SELECT * FROM scheduled_tasks WHERE chat_uuid = ? ORDER BY run_at ASC
      `),
      listByStatus: db.prepare(`
        SELECT * FROM scheduled_tasks WHERE status = ? ORDER BY run_at ASC LIMIT ?
      `),
      deleteById: db.prepare(`
        DELETE FROM scheduled_tasks WHERE id = ?
      `),
      claimDueTasks: db.prepare(`
        SELECT * FROM scheduled_tasks
        WHERE status = ? AND run_at <= ?
        ORDER BY run_at ASC
        LIMIT ?
      `)
    }
  }

  insertTask(row: ScheduledTaskRow): void {
    this.stmts.insertTask.run(
      row.id,
      row.chat_uuid,
      row.plan_id,
      row.goal,
      row.run_at,
      row.timezone,
      row.status,
      row.payload,
      row.attempt_count,
      row.max_attempts,
      row.last_error,
      row.result_message_id,
      row.created_at,
      row.updated_at
    )
  }

  updateTask(row: ScheduledTaskRow): void {
    this.stmts.updateTask.run(
      row.chat_uuid,
      row.plan_id,
      row.goal,
      row.run_at,
      row.timezone,
      row.status,
      row.payload,
      row.attempt_count,
      row.max_attempts,
      row.last_error,
      row.result_message_id,
      row.updated_at,
      row.id
    )
  }

  updateStatus(
    id: string,
    status: string,
    attemptCount: number,
    lastError: string | null,
    resultMessageId: number | null,
    updatedAt: number
  ): void {
    this.stmts.updateStatus.run(status, attemptCount, lastError, resultMessageId, updatedAt, id)
  }

  getById(id: string): ScheduledTaskRow | undefined {
    return this.stmts.getById.get(id) as ScheduledTaskRow | undefined
  }

  getByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return this.stmts.getByChatUuid.all(chatUuid) as ScheduledTaskRow[]
  }

  listByStatus(status: string, limit: number): ScheduledTaskRow[] {
    return this.stmts.listByStatus.all(status, limit) as ScheduledTaskRow[]
  }

  claimDueTasks(now: number, limit: number): ScheduledTaskRow[] {
    return this.stmts.claimDueTasks.all('pending', now, limit) as ScheduledTaskRow[]
  }

  deleteById(id: string): void {
    this.stmts.deleteById.run(id)
  }
}

export { ScheduledTaskRepository }
