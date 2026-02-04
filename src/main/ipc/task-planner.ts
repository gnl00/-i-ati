import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
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

function registerTaskPlanHandlers() {
  ipcMain.handle(DB_TASK_PLAN_SAVE, (_event, plan: Plan) => {
    console.log(`[Database IPC] Save task plan: ${plan.id}`)
    return DatabaseService.saveTaskPlan(plan)
  })

  ipcMain.handle(DB_TASK_PLAN_UPDATE, (_event, plan: Plan) => {
    console.log(`[Database IPC] Update task plan: ${plan.id}`)
    return DatabaseService.updateTaskPlan(plan)
  })

  ipcMain.handle(DB_TASK_PLAN_UPDATE_STATUS, (_event, data: { id: string; status: PlanStatus; currentStepId?: string; failureReason?: string }) => {
    console.log(`[Database IPC] Update task plan status: ${data.id} -> ${data.status}`)
    return DatabaseService.updateTaskPlanStatus(data.id, data.status, data.currentStepId, data.failureReason)
  })

  ipcMain.handle(DB_TASK_PLAN_GET_BY_ID, (_event, id: string) => {
    console.log(`[Database IPC] Get task plan by id: ${id}`)
    return DatabaseService.getTaskPlanById(id)
  })

  ipcMain.handle(DB_TASK_PLAN_GET_BY_CHAT_UUID, (_event, chatUuid: string) => {
    console.log(`[Database IPC] Get task plans by chat uuid: ${chatUuid}`)
    return DatabaseService.getTaskPlansByChatUuid(chatUuid)
  })

  ipcMain.handle(DB_TASK_PLAN_DELETE, (_event, id: string) => {
    console.log(`[Database IPC] Delete task plan: ${id}`)
    return DatabaseService.deleteTaskPlan(id)
  })

  ipcMain.handle(DB_TASK_PLAN_STEP_UPSERT, (_event, data: { planId: string; step: PlanStep }) => {
    console.log(`[Database IPC] Upsert task plan step: ${data.planId}/${data.step.id}`)
    return DatabaseService.upsertTaskPlanStep(data.planId, data.step)
  })

  ipcMain.handle(DB_TASK_PLAN_STEP_UPDATE_STATUS, (_event, data: { planId: string; stepId: string; status: PlanStep['status']; output?: unknown; error?: string; notes?: string }) => {
    console.log(`[Database IPC] Update task plan step status: ${data.planId}/${data.stepId} -> ${data.status}`)
    return DatabaseService.updateTaskPlanStepStatus(data.planId, data.stepId, data.status, data.output, data.error, data.notes)
  })
}

export { registerTaskPlanHandlers }
