import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/db/DatabaseService'
import { planningDb } from '@main/db/planning'
import { RunService } from '@main/orchestration/chat/run'
import { createLogger } from '@main/logging/LogService'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { resolveNewChatModelRef } from '@shared/services/ChatModelResolver'
import { ScheduleEventEmitter } from './event-emitter'
import type { ScheduledTaskRow } from '@main/db/dao/ScheduledTaskDao'

type ScheduledTaskPayload = {
  prompt?: string
  modelRef?: ModelRef
}

const MAX_TIMEOUT_DELAY_MS = 2_147_483_647
const MIN_DUE_RETRY_DELAY_MS = 1000

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null
  private dueTimer: NodeJS.Timeout | null = null
  private isTicking = false
  private readonly runService = new RunService()
  private readonly logger = createLogger('SchedulerService')

  start(intervalMs: number = 10000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.runTickAndReschedule()
    }, intervalMs)
    void this.runTickAndReschedule()
    this.logger.info('scheduler.started', { intervalMs })
  }

  stop(): void {
    const wasRunning = Boolean(this.timer || this.dueTimer)
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.clearDueTimer()
    if (wasRunning) {
      this.logger.info('scheduler.stopped')
    }
  }

  private async runTickAndReschedule(): Promise<void> {
    await this.tick()
    this.scheduleNextDueTask()
  }

  private clearDueTimer(): void {
    if (!this.dueTimer) return
    clearTimeout(this.dueTimer)
    this.dueTimer = null
  }

  private scheduleNextDueTask(): void {
    this.clearDueTimer()

    try {
      const nextTask = planningDb.getScheduledTasksByStatus('pending', 1)[0]
      if (!nextTask) return

      const rawDelayMs = nextTask.run_at - Date.now()
      const delayMs = Math.min(
        MAX_TIMEOUT_DELAY_MS,
        rawDelayMs <= 0 ? MIN_DUE_RETRY_DELAY_MS : rawDelayMs
      )

      this.dueTimer = setTimeout(() => {
        this.dueTimer = null
        void this.runTickAndReschedule()
      }, delayMs)

      this.logger.debug('next_due_task.scheduled', {
        taskId: nextTask.id,
        runAt: nextTask.run_at,
        delayMs
      })
    } catch (error) {
      this.logger.error('next_due_task.schedule_failed', error)
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return
    this.isTicking = true
    try {
      const tasks = planningDb.claimDueScheduledTasks(Date.now(), 5)
      this.logger.debug('tick.claimed_due_tasks', { count: tasks.length })
      for (const task of tasks) {
        await this.runTask(task)
      }
    } catch (error) {
      this.logger.error('tick.failed', error)
    } finally {
      this.isTicking = false
    }
  }

  private async runTask(task: ScheduledTaskRow): Promise<void> {
    const nextAttempt = (task.attempt_count || 0) + 1
    try {
      const chat = DatabaseService.getChatByUuid(task.chat_uuid)
      if (!chat?.id || !chat.uuid) {
        throw new Error(`Chat not found for chat_uuid=${task.chat_uuid}`)
      }

      if (this.runService.hasActiveRunForChat(task.chat_uuid)) {
        this.logger.info('task.skipped.chat_busy', {
          taskId: task.id,
          chatUuid: task.chat_uuid
        })
        return
      }

      const emitter = new ScheduleEventEmitter({
        chatId: chat.id,
        chatUuid: chat.uuid
      })

      const payload = this.parsePayload(task.payload)
      const modelRef = payload.modelRef ?? chat.modelRef ?? this.resolveFallbackModelRef()
      if (!modelRef) {
        throw new Error(`No modelRef resolved for chat_uuid=${task.chat_uuid}`)
      }

      const prompt = payload.prompt?.trim() || task.goal
      const submissionId = uuidv4()

      this.logger.info('task.started', {
        taskId: task.id,
        chatUuid: task.chat_uuid,
        submissionId,
        attempt: nextAttempt
      })
      planningDb.updateScheduledTaskStatus(task.id, 'running', nextAttempt, undefined, undefined)
      emitter.emit(SCHEDULE_EVENTS.STARTED, {
        task: planningDb.getScheduledTaskById(task.id) ?? {
          ...task,
          status: 'running',
          attempt_count: nextAttempt,
          last_error: null,
          result_message_id: null,
          updated_at: Date.now()
        },
        submissionId,
        attempt: nextAttempt
      })

      const submitResult = await this.runService.execute({
        submissionId,
        chatId: chat.id,
        chatUuid: chat.uuid,
        modelRef,
        input: {
          textCtx: prompt,
          mediaCtx: [],
          source: 'schedule',
          stream: true
        }
      })

      const assistantMessageId = submitResult.assistantMessageId
      planningDb.updateScheduledTaskStatus(
        task.id,
        'completed',
        nextAttempt,
        undefined,
        assistantMessageId
      )
      this.logger.info('task.completed', {
        taskId: task.id,
        chatUuid: task.chat_uuid,
        attempt: nextAttempt,
        assistantMessageId
      })

      const userMessage = submitResult.userMessageId
        ? DatabaseService.getMessageById(submitResult.userMessageId)
        : undefined
      if (userMessage) {
        emitter.emit(SCHEDULE_EVENTS.MESSAGE_CREATED, { message: userMessage })
      }
      if (assistantMessageId) {
        const assistantMessage = DatabaseService.getMessageById(assistantMessageId)
        if (assistantMessage) {
          emitter.emit(SCHEDULE_EVENTS.MESSAGE_CREATED, { message: assistantMessage })
        }
      }

      emitter.emit(SCHEDULE_EVENTS.UPDATED, {
        task: planningDb.getScheduledTaskById(task.id) ?? task
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const maxAttempts = task.max_attempts ?? 0
      const status = maxAttempts === 0 || nextAttempt >= maxAttempts ? 'failed' : 'pending'
      planningDb.updateScheduledTaskStatus(task.id, status, nextAttempt, message, undefined)
      this.emitScheduleUpdated(task.id)
      this.logger.error('task.failed', {
        taskId: task.id,
        chatUuid: task.chat_uuid,
        nextAttempt,
        status,
        error: message
      })
    }
  }

  private parsePayload(payload: string | null): ScheduledTaskPayload {
    if (!payload) return {}
    try {
      const parsed = JSON.parse(payload)
      if (parsed && typeof parsed === 'object') {
        return parsed as ScheduledTaskPayload
      }
    } catch {
      // ignore malformed payload
    }
    return {}
  }

  private resolveFallbackModelRef(): ModelRef | undefined {
    const config = DatabaseService.getConfig()
    if (!config) return undefined
    return resolveNewChatModelRef(config)
  }

  private emitScheduleUpdated(taskId: string): void {
    const task = planningDb.getScheduledTaskById(taskId)
    if (!task) return
    const chat = DatabaseService.getChatByUuid(task.chat_uuid)
    const emitter = new ScheduleEventEmitter({
      chatId: chat?.id,
      chatUuid: task.chat_uuid
    })
    emitter.emit(SCHEDULE_EVENTS.UPDATED, { task })
  }
}

export const schedulerService = new SchedulerService()
