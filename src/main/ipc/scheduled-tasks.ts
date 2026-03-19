import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { ScheduleEventEmitter } from '@main/services/scheduler/event-emitter'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID, DB_SCHEDULED_TASK_UPDATE_STATUS } from '@shared/constants'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'

const emitScheduledTaskUpdated = (taskId: string): void => {
  const task = DatabaseService.getScheduledTaskById(taskId)
  if (!task) return

  const chat = DatabaseService.getChatByUuid(task.chat_uuid)
  const emitter = new ScheduleEventEmitter({
    chatId: chat?.id,
    chatUuid: task.chat_uuid
  })
  emitter.emit(SCHEDULE_EVENTS.UPDATED, { task })
}

export function registerScheduledTaskHandlers(): void {
  ipcMain.handle(DB_SCHEDULED_TASKS_GET_BY_CHAT_UUID, async (_event, chatUuid: string) => {
    console.log(`[Database IPC] Get scheduled tasks by chat uuid: ${chatUuid}`)
    return DatabaseService.getScheduledTasksByChatUuid(chatUuid)
  })

  ipcMain.handle(
    DB_SCHEDULED_TASK_UPDATE_STATUS,
    async (
      _event,
      args: { id: string; status: ScheduleTaskStatus; lastError?: string | null }
    ) => {
      console.log(`[Database IPC] Update scheduled task status: ${args.id} -> ${args.status}`)

      const task = DatabaseService.getScheduledTaskById(args.id)
      if (!task) {
        throw new Error(`Scheduled task not found: ${args.id}`)
      }

      const allowedStatusTransitions: ScheduleTaskStatus[] = ['cancelled', 'dismissed']
      if (!allowedStatusTransitions.includes(args.status)) {
        throw new Error(`Unsupported scheduled task status update: ${args.status}`)
      }

      if (args.status === 'cancelled' && !['pending', 'running'].includes(task.status)) {
        throw new Error(`Cannot cancel task in status: ${task.status}`)
      }

      if (args.status === 'dismissed' && !['completed', 'failed', 'cancelled'].includes(task.status)) {
        throw new Error(`Cannot dismiss task in status: ${task.status}`)
      }

      DatabaseService.updateScheduledTaskStatus(
        task.id,
        args.status,
        task.attempt_count,
        args.lastError ?? task.last_error ?? undefined,
        task.result_message_id ?? undefined
      )

      emitScheduledTaskUpdated(task.id)
      return DatabaseService.getScheduledTaskById(task.id)
    }
  )
}
