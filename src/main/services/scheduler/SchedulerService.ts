import { v4 as uuidv4 } from 'uuid'
import { chatDb } from '@main/db/chat'
import { configDb } from '@main/db/config'
import { planningDb } from '@main/db/planning'
import { RunService } from '@main/orchestration/chat/run'
import { createSchedulerLogger } from '@main/logging/LogService'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { resolveLiteModelRef } from '@shared/services/ChatModelResolver'
import { notifyTerminalRunFailure } from '@main/notifications/AgentNotificationSink'
import { ScheduleEventEmitter } from './event-emitter'
import { cronScheduleCalculator } from './CronScheduleCalculator'
import type { ClaimedScheduledRun, ScheduledTaskRow, ScheduledTaskRunRow } from '@main/db/dao/ScheduledTaskDao'

type ScheduledTaskPayload = { prompt?: string; modelRef?: ModelRef }

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647
const MIN_DUE_RETRY_DELAY_MS = 1000
const CHAT_BUSY_DELAY_MS = 30_000
const RETRY_BASE_DELAY_MS = 30_000
const RETRY_MAX_DELAY_MS = 15 * 60_000

export const calculateScheduleRetryDelay = (attempt: number): number =>
  Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempt - 1)))

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null
  private dueTimer: NodeJS.Timeout | null = null
  private isTicking = false
  private readonly runService = new RunService()
  private readonly logger = createSchedulerLogger('SchedulerService')

  start(intervalMs = 10000): void {
    if (this.timer) return
    this.recoverInterruptedRuns()
    this.timer = setInterval(() => void this.runTickAndReschedule(), intervalMs)
    void this.runTickAndReschedule()
    this.logger.info('scheduler.started', { intervalMs })
  }

  stop(): void {
    const wasRunning = Boolean(this.timer || this.dueTimer)
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.clearDueTimer()
    if (wasRunning) this.logger.info('scheduler.stopped')
  }

  wake(): void {
    if (!this.timer) return
    void this.runTickAndReschedule()
  }

  cancelTask(taskId: string, reason = 'Cancelled by user'): ScheduledTaskRow | undefined {
    const task = planningDb.getScheduledTaskById(taskId)
    if (!task) return undefined
    const { submissionId } = planningDb.cancelScheduledTask(taskId, reason, Date.now())
    if (submissionId) this.runService.cancel(submissionId)
    this.emitScheduleUpdated(taskId)
    this.wake()
    return planningDb.getScheduledTaskById(taskId)
  }

  dismissTask(taskId: string): ScheduledTaskRow | undefined {
    planningDb.dismissScheduledTask(taskId, Date.now())
    this.emitScheduleUpdated(taskId)
    return planningDb.getScheduledTaskById(taskId)
  }

  private recoverInterruptedRuns(): void {
    const now = Date.now()
    for (const item of planningDb.listRunningScheduledTaskRuns()) {
      const nextRun = item.task.schedule_type === 'cron' ? this.buildNextRunOrNull(item.task, now) : null
      planningDb.recoverScheduledTaskRun(item.run.id, nextRun, now)
      this.emitRunFinished(item.task.id, item.run.id)
      this.emitScheduleUpdated(item.task.id)
      this.logger.warn('task.recovered_interrupted', { taskId: item.task.id, runId: item.run.id })
    }
  }

  private async runTickAndReschedule(): Promise<void> {
    await this.tick()
    this.scheduleNextDueTask()
  }

  private clearDueTimer(): void {
    if (this.dueTimer) clearTimeout(this.dueTimer)
    this.dueTimer = null
  }

  private scheduleNextDueTask(): void {
    this.clearDueTimer()
    try {
      const nextTask = planningDb.getScheduledTasksByStatus('pending', 1)[0]
      if (!nextTask) return
      const rawDelayMs = nextTask.run_at - Date.now()
      const delayMs = Math.min(MAX_TIMEOUT_DELAY_MS, rawDelayMs <= 0 ? MIN_DUE_RETRY_DELAY_MS : rawDelayMs)
      this.dueTimer = setTimeout(() => {
        this.dueTimer = null
        void this.runTickAndReschedule()
      }, delayMs)
      this.logger.debug('next_due_task.scheduled', { taskId: nextTask.id, runAt: nextTask.run_at, delayMs })
    } catch (error) {
      this.logger.error('next_due_task.schedule_failed', error)
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return
    this.isTicking = true
    try {
      const runs = planningDb.claimDueScheduledTaskRuns(Date.now(), 5)
      this.logger.debug('tick.claimed_due_tasks', { count: runs.length })
      for (const item of runs) await this.runTask(item)
    } catch (error) {
      this.logger.error('tick.failed', error)
    } finally {
      this.isTicking = false
    }
  }

  private async runTask({ task, run }: ClaimedScheduledRun): Promise<void> {
    let chat: ChatEntity | undefined
    let activeRun = run
    let executionSucceeded = false
    try {
      chat = chatDb.getChatByUuid(task.chat_uuid)
      const emitter = new ScheduleEventEmitter({ chatId: chat?.id, chatUuid: task.chat_uuid })
      if (this.runService.hasActiveRunForChat(task.chat_uuid)) {
        const nextAttemptAt = Date.now() + CHAT_BUSY_DELAY_MS
        planningDb.deferScheduledTaskRun(run.id, nextAttemptAt, Date.now())
        this.logger.info('task.deferred.chat_busy', { taskId: task.id, runId: run.id, nextAttemptAt })
        this.emitScheduleUpdated(task.id)
        return
      }

      const submissionId = uuidv4()
      const started = planningDb.startScheduledTaskRunAttempt(run.id, submissionId, Date.now())
      if (!started) throw new Error(`Scheduled run unavailable: ${run.id}`)
      activeRun = started
      if (!chat?.id || !chat.uuid) throw new Error(`Chat not found for chat_uuid=${task.chat_uuid}`)

      const payload = this.parsePayload(task.payload)
      const modelRef = payload.modelRef ?? this.resolveFallbackModelRef() ?? chat.modelRef
      if (!modelRef) throw new Error(`No modelRef resolved for chat_uuid=${task.chat_uuid}`)

      this.logger.info('task.started', { taskId: task.id, runId: run.id, submissionId, attempt: started.attempt_count })
      emitter.emit(SCHEDULE_EVENTS.STARTED, { task, run: started, submissionId, attempt: started.attempt_count })

      const result = await this.runService.execute({
        submissionId,
        chatId: chat.id,
        chatUuid: chat.uuid,
        modelRef,
        ...(chat.modelRef ? { chatModelRef: chat.modelRef } : {}),
        input: {
          textCtx: payload.prompt?.trim() || task.goal,
          mediaCtx: [],
          source: 'schedule',
          stream: true,
          nativeNotification: {
            notifyOnFailure: started.attempt_count >= Math.max(1, task.max_attempts),
            occurrenceKey: run.id
          }
        }
      })
      executionSucceeded = true

      const currentTask = planningDb.getScheduledTaskById(task.id)
      if (currentTask?.status === 'cancelled') {
        this.emitRunFinished(task.id, run.id)
        return
      }

      const nextRun = task.schedule_type === 'cron' ? this.buildNextRun(task, Date.now()) : null
      planningDb.completeScheduledTaskRun(run.id, result.assistantMessageId ?? null, nextRun, Date.now())
      this.emitMessages(emitter, result.userMessageId, result.assistantMessageId)
      this.emitRunFinished(task.id, run.id)
      this.emitScheduleUpdated(task.id)
      this.logger.info('task.completed', { taskId: task.id, runId: run.id, attempt: started.attempt_count })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const currentTask = planningDb.getScheduledTaskById(task.id)
      if (currentTask?.status === 'cancelled') {
        this.emitRunFinished(task.id, run.id)
        this.logger.info('task.cancelled', { taskId: task.id, runId: run.id })
        return
      }
      const attempt = activeRun.attempt_count
      const maxAttempts = Math.max(1, task.max_attempts)
      const retryAt = attempt > 0 && attempt < maxAttempts
        ? Date.now() + calculateScheduleRetryDelay(attempt)
        : null
      const nextRun = retryAt === null && task.schedule_type === 'cron' ? this.buildNextRunOrNull(task, Date.now()) : null
      planningDb.failScheduledTaskRun(run.id, message, retryAt, nextRun, Date.now())
      if (retryAt === null) {
        if (currentTask && !executionSucceeded) {
          notifyTerminalRunFailure({
            title: chat?.title ?? task.goal,
            body: message,
            occurrenceKey: run.id
          })
        }
        this.emitRunFinished(task.id, run.id)
      }
      this.emitScheduleUpdated(task.id)
      this.logger.error('task.failed', { taskId: task.id, runId: run.id, attempt, retryAt, error: message })
    }
  }

  private buildNextRun(task: ScheduledTaskRow, after: number): ScheduledTaskRunRow {
    if (!task.cron_expression || !task.timezone) throw new Error(`Cron schedule is incomplete: ${task.id}`)
    const scheduledFor = cronScheduleCalculator.next(task.cron_expression, task.timezone, after)
    const now = Date.now()
    return {
      id: uuidv4(), task_id: task.id, scheduled_for: scheduledFor, next_attempt_at: scheduledFor,
      status: 'pending', attempt_count: 0, submission_id: null, started_at: null, finished_at: null,
      last_error: null, result_message_id: null, created_at: now, updated_at: now
    }
  }

  private buildNextRunOrNull(task: ScheduledTaskRow, after: number): ScheduledTaskRunRow | null {
    try {
      return this.buildNextRun(task, after)
    } catch (error) {
      this.logger.error('cron.next_occurrence_failed', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  private emitMessages(emitter: ScheduleEventEmitter, userId?: number, assistantId?: number): void {
    for (const id of [userId, assistantId]) {
      if (!id) continue
      const message = chatDb.getMessageById(id)
      if (message) emitter.emit(SCHEDULE_EVENTS.MESSAGE_CREATED, { message })
    }
  }

  private parsePayload(payload: string | null): ScheduledTaskPayload {
    if (!payload) return {}
    try {
      const parsed = JSON.parse(payload)
      return parsed && typeof parsed === 'object' ? parsed as ScheduledTaskPayload : {}
    } catch { return {} }
  }

  private resolveFallbackModelRef(): ModelRef | undefined {
    const config = configDb.getConfig()
    return config ? resolveLiteModelRef(config) : undefined
  }

  private emitRunFinished(taskId: string, runId: string): void {
    const task = planningDb.getScheduledTaskById(taskId)
    const run = planningDb.getScheduledTaskRuns(taskId).find(item => item.id === runId)
    if (!task || !run) return
    const chat = chatDb.getChatByUuid(task.chat_uuid)
    new ScheduleEventEmitter({ chatId: chat?.id, chatUuid: task.chat_uuid }).emit(SCHEDULE_EVENTS.RUN_FINISHED, { task, run })
  }

  private emitScheduleUpdated(taskId: string): void {
    const task = planningDb.getScheduledTaskById(taskId)
    if (!task) return
    const chat = chatDb.getChatByUuid(task.chat_uuid)
    new ScheduleEventEmitter({ chatId: chat?.id, chatUuid: task.chat_uuid }).emit(SCHEDULE_EVENTS.UPDATED, { task })
  }
}

export const schedulerService = new SchedulerService()
