import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/services/DatabaseService'
import { ChatRunService } from '@main/services/chatRun'
import { createLogger } from '@main/services/logging/LogService'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { ScheduleEventEmitter } from './event-emitter'
import type { ScheduledTaskRow } from '@main/db/repositories/ScheduledTaskRepository'

type ScheduledTaskPayload = {
  prompt?: string
  modelRef?: ModelRef
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null
  private isTicking = false
  private readonly chatRunService = new ChatRunService()
  private readonly logger = createLogger('SchedulerService')

  start(intervalMs: number = 10000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, intervalMs)
    void this.tick()
    this.logger.info('scheduler.started', { intervalMs })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      this.logger.info('scheduler.stopped')
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return
    this.isTicking = true
    try {
      const tasks = DatabaseService.claimDueScheduledTasks(Date.now(), 5)
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

      if (this.chatRunService.hasActiveRunForChat(task.chat_uuid)) {
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
      const modelRef = payload.modelRef ?? this.resolveModelRef(chat.model)
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
      DatabaseService.updateScheduledTaskStatus(task.id, 'running', nextAttempt, undefined, undefined)

      const submitResult = await this.chatRunService.execute({
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
      DatabaseService.updateScheduledTaskStatus(
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
        task: DatabaseService.getScheduledTaskById(task.id) ?? task
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const maxAttempts = task.max_attempts ?? 0
      const status = maxAttempts === 0 || nextAttempt >= maxAttempts ? 'failed' : 'pending'
      DatabaseService.updateScheduledTaskStatus(task.id, status, nextAttempt, message, undefined)
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

  private resolveModelRef(chatModelId?: string | null): ModelRef | undefined {
    const config = DatabaseService.getConfig()
    if (!config?.accounts?.length) return undefined

    if (chatModelId) {
      for (const account of config.accounts) {
        const model = account.models.find(m => m.id === chatModelId)
        if (model) {
          return { accountId: account.id, modelId: model.id }
        }
      }
    }

    const account = config.accounts[0]
    const model = account.models[0]
    if (!account || !model) return undefined
    return { accountId: account.id, modelId: model.id }
  }

  private emitScheduleUpdated(taskId: string): void {
    const task = DatabaseService.getScheduledTaskById(taskId)
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
