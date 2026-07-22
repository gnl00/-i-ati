import { ipcMain } from 'electron'
import { planningDb } from '@main/db/planning'
import { createLogger } from '@main/logging/LogService'
import { schedulerService } from '@main/services/scheduler/SchedulerService'
import { DB_SCHEDULED_TASKS_LIST, DB_SCHEDULED_TASK_UPDATE_STATUS } from '@shared/constants'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { ScheduledTaskRow } from '@main/db/dao/ScheduledTaskDao'

const logger = createLogger('DatabaseIPC')

export function registerScheduledTaskHandlers(): void {
  const handleScheduledTasksList = async (): Promise<ScheduledTaskRow[]> => {
    logger.info('scheduled_tasks.list')
    return planningDb.getScheduledTasks()
  }

  ipcMain.handle(DB_SCHEDULED_TASKS_LIST, handleScheduledTasksList)

  ipcMain.handle(
    DB_SCHEDULED_TASK_UPDATE_STATUS,
    async (
      _event,
      args: { id: string; status: ScheduleTaskStatus; lastError?: string | null }
    ) => {
      logger.info('scheduled_task.update_status', { id: args.id, status: args.status })

      const task = planningDb.getScheduledTaskById(args.id)
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

      if (args.status === 'cancelled') {
        schedulerService.cancelTask(task.id, args.lastError ?? 'Cancelled by user')
      } else {
        schedulerService.dismissTask(task.id)
      }

      return planningDb.getScheduledTaskById(task.id)
    }
  )
}
