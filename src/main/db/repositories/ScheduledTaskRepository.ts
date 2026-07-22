import type {
  ClaimedScheduledRun,
  ScheduledTaskDao,
  ScheduledTaskRow,
  ScheduledTaskRunRow
} from '@main/db/dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'

type Deps = { hasDb: () => boolean; getScheduledTaskRepo: () => ScheduledTaskDao | undefined }

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
  claimDue(now: number, limit: number): ClaimedScheduledRun[] { return this.dao().claimDueRuns(now, limit) }
  startAttempt(runId: string, submissionId: string, now: number): ScheduledTaskRunRow | undefined { return this.dao().startRunAttempt(runId, submissionId, now) }
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
}
