import DatabaseService from './DatabaseService'
import type { ScheduledTaskRow } from './dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

export const planningDb = {
  saveTaskPlan(plan: Plan): void {
    DatabaseService.saveTaskPlan(plan)
  },

  updateTaskPlan(plan: Plan): void {
    DatabaseService.updateTaskPlan(plan)
  },

  updateTaskPlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void {
    DatabaseService.updateTaskPlanStatus(id, status, currentStepId, failureReason)
  },

  getTaskPlanById(id: string): Plan | undefined {
    return DatabaseService.getTaskPlanById(id)
  },

  getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    return DatabaseService.getTaskPlansByChatUuid(chatUuid)
  },

  deleteTaskPlan(id: string): void {
    DatabaseService.deleteTaskPlan(id)
  },

  saveTaskPlanSteps(planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void {
    DatabaseService.saveTaskPlanSteps(planId, steps, createdAt, updatedAt)
  },

  upsertTaskPlanStep(planId: string, step: PlanStep): void {
    DatabaseService.upsertTaskPlanStep(planId, step)
  },

  updateTaskPlanStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): void {
    DatabaseService.updateTaskPlanStepStatus(planId, stepId, status, output, error, notes)
  },

  saveScheduledTask(task: ScheduledTaskRow): void {
    DatabaseService.saveScheduledTask(task)
  },

  updateScheduledTask(task: ScheduledTaskRow): void {
    DatabaseService.updateScheduledTask(task)
  },

  updateScheduledTaskStatus(
    id: string,
    status: ScheduleTaskStatus,
    attemptCount: number,
    lastError?: string,
    resultMessageId?: number
  ): void {
    DatabaseService.updateScheduledTaskStatus(id, status, attemptCount, lastError, resultMessageId)
  },

  getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    return DatabaseService.getScheduledTaskById(id)
  },

  getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return DatabaseService.getScheduledTasksByChatUuid(chatUuid)
  },

  getScheduledTasksByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    return DatabaseService.getScheduledTasksByStatus(status, limit)
  },

  claimDueScheduledTasks(now: number, limit: number): ScheduledTaskRow[] {
    return DatabaseService.claimDueScheduledTasks(now, limit)
  },

  deleteScheduledTask(id: string): void {
    DatabaseService.deleteScheduledTask(id)
  }
}
