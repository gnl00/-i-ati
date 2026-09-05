import type Database from 'better-sqlite3'
import type { ChatDao } from '@main/db/dao/ChatDao'
import type {
  ClaimedScheduledRun,
  ScheduledTaskDao,
  ScheduledTaskRow,
  ScheduledTaskRunAttemptRow,
  ScheduledTaskRunRow
} from '@main/db/dao/ScheduledTaskDao'
import { toChatRow } from '@main/db/mappers/ChatMapper'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'

type Deps = {
  hasDb: () => boolean
  getDb: () => Database.Database | null
  getScheduledTaskRepo: () => ScheduledTaskDao | undefined
  getChatRepo: () => ChatDao | undefined
}

export type ScheduledExecutionChatBinding = {
  chat: ChatEntity
  run: ScheduledTaskRunRow
}

export class ScheduledTaskRepository {
  constructor(private readonly deps: Deps) {}

  create(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void { this.dao().insertTaskWithRun(task, run) }
  update(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void { this.dao().replacePendingRun(task, run) }
  getById(id: string): ScheduledTaskRow | undefined { return this.dao().getById(id) }
  getByChatUuid(chatUuid: string): ScheduledTaskRow[] { return this.dao().getByChatUuid(chatUuid) }
  listAll(): ScheduledTaskRow[] { return this.dao().listAll() }
  listByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] { return this.dao().listByStatus(status, limit) }
  getActiveRun(taskId: string): ScheduledTaskRunRow | undefined { return this.dao().getActiveRunByTaskId(taskId) }
  listRuns(taskId: string, limit?: number): ScheduledTaskRunRow[] { return this.dao().listRunsByTaskId(taskId, limit) }
  listRunAttempts(runId: string, limit?: number): ScheduledTaskRunAttemptRow[] { return this.dao().listRunAttempts(runId, limit) }
  claimDue(now: number, limit: number): ClaimedScheduledRun[] { return this.dao().claimDueRuns(now, limit) }
  startAttempt(runId: string, submissionId: string, now: number): ScheduledTaskRunRow | undefined { return this.dao().startRunAttempt(runId, submissionId, now) }
  createExecutionChatAndBindAttempt(
    runId: string,
    attempt: number,
    submissionId: string,
    chat: ChatEntity,
    now: number
  ): ScheduledExecutionChatBinding {
    const db = this.db()
    const scheduledTaskDao = this.dao()
    const chatDao = this.chatDao()
    const transaction = db.transaction(() => {
      const chatId = chatDao.insertChat(toChatRow(chat))
      const run = scheduledTaskDao.bindRunAttempt(
        runId,
        attempt,
        submissionId,
        chat.uuid,
        now
      )
      if (!run) throw new Error(`Scheduled run binding unavailable: ${runId}`)
      return {
        chat: { ...chat, id: chatId },
        run
      }
    })
    return transaction()
  }
  defer(runId: string, nextAttemptAt: number, now: number): void { this.dao().deferRun(runId, nextAttemptAt, now) }
  complete(runId: string, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void { this.dao().completeRun(runId, resultMessageId, nextRun, now) }
  fail(runId: string, error: string, retryAt: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void { this.dao().failRun(runId, error, retryAt, nextRun, now) }
  cancel(taskId: string, reason: string, now: number): { submissionId: string | null } { return this.dao().cancelTask(taskId, reason, now) }
  dismiss(taskId: string, now: number): void { this.dao().dismissTask(taskId, now) }
  listRunning(): ClaimedScheduledRun[] { return this.dao().listRunningRuns() }
  recover(runId: string, nextRun: ScheduledTaskRunRow | null, now: number): void { this.dao().recoverInterruptedRun(runId, nextRun, now) }
  delete(id: string): void { this.dao().deleteById(id) }

  private dao(): ScheduledTaskDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const dao = this.deps.getScheduledTaskRepo()
    if (!dao) throw new Error('Scheduled task repository not initialized')
    return dao
  }

  private db(): Database.Database {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private chatDao(): ChatDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const dao = this.deps.getChatRepo()
    if (!dao) throw new Error('Chat DAO not initialized')
    return dao
  }
}
