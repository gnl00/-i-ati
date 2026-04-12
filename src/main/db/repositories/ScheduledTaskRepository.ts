import type { ScheduledTaskDao, ScheduledTaskRow } from '@main/db/dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'

type ScheduledTaskRepositoryDeps = {
  hasDb: () => boolean
  getScheduledTaskRepo: () => ScheduledTaskDao | undefined
}

export class ScheduledTaskRepository {
  constructor(private readonly deps: ScheduledTaskRepositoryDeps) {}

  saveScheduledTask(task: ScheduledTaskRow): void {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    scheduledTaskRepo.insertTask(task)
  }

  updateScheduledTask(task: ScheduledTaskRow): void {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    scheduledTaskRepo.updateTask(task)
  }

  updateScheduledTaskStatus(
    id: string,
    status: ScheduleTaskStatus,
    attemptCount: number,
    lastError?: string,
    resultMessageId?: number
  ): void {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    scheduledTaskRepo.updateStatus(
      id,
      status,
      attemptCount,
      lastError ?? null,
      resultMessageId ?? null,
      Date.now()
    )
  }

  getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    return scheduledTaskRepo.getById(id)
  }

  getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    return scheduledTaskRepo.getByChatUuid(chatUuid)
  }

  getScheduledTasksByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    return scheduledTaskRepo.listByStatus(status, limit)
  }

  claimDueScheduledTasks(now: number, limit: number): ScheduledTaskRow[] {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    return scheduledTaskRepo.claimDueTasks(now, limit)
  }

  deleteScheduledTask(id: string): void {
    const scheduledTaskRepo = this.requireScheduledTaskRepo()
    scheduledTaskRepo.deleteById(id)
  }

  private requireScheduledTaskRepo(): ScheduledTaskDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getScheduledTaskRepo()
    if (!repo) throw new Error('Scheduled task repository not initialized')
    return repo
  }
}
