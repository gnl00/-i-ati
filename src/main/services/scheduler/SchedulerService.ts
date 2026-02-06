import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/services/DatabaseService'
import { MainChatSubmitService } from '@main/services/chatSubmit'
import { ScheduleEventEmitter } from './event-emitter'
import type { ScheduledTaskRow } from '@main/db/repositories/ScheduledTaskRepository'

type ScheduledTaskPayload = {
  prompt?: string
  modelRef?: ModelRef
}

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null
  private isTicking = false
  private readonly chatSubmitService = new MainChatSubmitService()

  start(intervalMs: number = 10000): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, intervalMs)
    void this.tick()
    console.log('[Scheduler] Started')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      console.log('[Scheduler] Stopped')
    }
  }

  private async tick(): Promise<void> {
    if (this.isTicking) return
    this.isTicking = true
    try {
      const tasks = DatabaseService.claimDueScheduledTasks(Date.now(), 5)
      for (const task of tasks) {
        await this.runTask(task)
      }
    } catch (error) {
      console.error('[Scheduler] Tick failed:', error)
    } finally {
      this.isTicking = false
    }
  }

  private async runTask(task: ScheduledTaskRow): Promise<void> {
    const nextAttempt = (task.attempt_count || 0) + 1
    DatabaseService.updateScheduledTaskStatus(task.id, 'running', nextAttempt, undefined, undefined)

    try {
      const chat = DatabaseService.getChatByUuid(task.chat_uuid)
      if (!chat?.id || !chat.uuid) {
        throw new Error(`Chat not found for chat_uuid=${task.chat_uuid}`)
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

      const userMessageId = DatabaseService.saveMessage({
        chatId: chat.id,
        chatUuid: chat.uuid,
        body: {
          role: 'user',
          content: prompt,
          segments: [
            {
              type: 'text',
              content: prompt,
              timestamp: Date.now()
            }
          ],
          source: 'schedule'
        }
      })

      const submitResult = await this.chatSubmitService.submit({
        submissionId,
        chatId: chat.id,
        chatUuid: chat.uuid,
        modelRef,
        input: {
          textCtx: prompt,
          mediaCtx: [],
          stream: true
        },
        persistMessages: true
      })

      const assistantMessageId = submitResult.assistantMessageId
      DatabaseService.updateScheduledTaskStatus(
        task.id,
        'completed',
        nextAttempt,
        undefined,
        assistantMessageId
      )

      const userMessage = DatabaseService.getMessageById(userMessageId)
      if (userMessage) {
        emitter.emit('message.created', { message: userMessage })
      }
      if (assistantMessageId) {
        const assistantMessage = DatabaseService.getMessageById(assistantMessageId)
        if (assistantMessage) {
          emitter.emit('message.created', { message: assistantMessage })
        }
      }

      emitter.emit('schedule.updated', { task: DatabaseService.getScheduledTaskById(task.id) ?? task })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const maxAttempts = task.max_attempts ?? 0
      const status = maxAttempts === 0 || nextAttempt >= maxAttempts ? 'failed' : 'pending'
      DatabaseService.updateScheduledTaskStatus(task.id, status, nextAttempt, message, undefined)
      this.emitScheduleUpdated(task.id)
      console.error('[Scheduler] Task failed:', { taskId: task.id, error: message })
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
    emitter.emit('schedule.updated', { task })
  }
}

export const schedulerService = new SchedulerService()
