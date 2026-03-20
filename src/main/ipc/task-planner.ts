import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { createLogger } from '@main/services/logging/LogService'
import {
  DB_TASK_PLAN_DELETE,
  DB_TASK_PLAN_GET_BY_CHAT_UUID,
  DB_TASK_PLAN_GET_BY_ID,
  DB_TASK_PLAN_SAVE,
  DB_TASK_PLAN_STEP_UPDATE_STATUS,
  DB_TASK_PLAN_STEP_UPSERT,
  DB_TASK_PLAN_UPDATE,
  DB_TASK_PLAN_UPDATE_STATUS
} from '@shared/constants'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

const logger = createLogger('DatabaseIPC')

function registerTaskPlanHandlers() {
  ipcMain.handle(DB_TASK_PLAN_SAVE, (_event, plan: Plan) => {
    logger.info('task_plan.save', { planId: plan.id })
    return DatabaseService.saveTaskPlan(plan)
  })

  ipcMain.handle(DB_TASK_PLAN_UPDATE, (_event, plan: Plan) => {
    logger.info('task_plan.update', { planId: plan.id })
    return DatabaseService.updateTaskPlan(plan)
  })

  ipcMain.handle(DB_TASK_PLAN_UPDATE_STATUS, (_event, data: { id: string; status: PlanStatus; currentStepId?: string; failureReason?: string }) => {
    logger.info('task_plan.update_status', { planId: data.id, status: data.status, currentStepId: data.currentStepId })
    return DatabaseService.updateTaskPlanStatus(data.id, data.status, data.currentStepId, data.failureReason)
  })

  ipcMain.handle(DB_TASK_PLAN_GET_BY_ID, (_event, id: string) => {
    logger.info('task_plan.get_by_id', { id })
    return DatabaseService.getTaskPlanById(id)
  })

  ipcMain.handle(DB_TASK_PLAN_GET_BY_CHAT_UUID, (_event, chatUuid: string) => {
    logger.info('task_plan.get_by_chat_uuid', { chatUuid })
    return DatabaseService.getTaskPlansByChatUuid(chatUuid)
  })

  ipcMain.handle(DB_TASK_PLAN_DELETE, (_event, id: string) => {
    logger.info('task_plan.delete', { id })
    return DatabaseService.deleteTaskPlan(id)
  })

  ipcMain.handle(DB_TASK_PLAN_STEP_UPSERT, (_event, data: { planId: string; step: PlanStep }) => {
    logger.info('task_plan_step.upsert', { planId: data.planId, stepId: data.step.id })
    return DatabaseService.upsertTaskPlanStep(data.planId, data.step)
  })

  ipcMain.handle(DB_TASK_PLAN_STEP_UPDATE_STATUS, (_event, data: { planId: string; stepId: string; status: PlanStep['status']; output?: unknown; error?: string; notes?: string }) => {
    logger.info('task_plan_step.update_status', { planId: data.planId, stepId: data.stepId, status: data.status })
    return DatabaseService.updateTaskPlanStepStatus(data.planId, data.stepId, data.status, data.output, data.error, data.notes)
  })
}

export { registerTaskPlanHandlers }
