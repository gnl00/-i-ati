import type { ScheduledTaskRow } from '../dao/ScheduledTaskDao'
import type { ScheduledTaskRepository } from '../repositories/ScheduledTaskRepository'
import type { TaskPlanRepository } from '../repositories/TaskPlanRepository'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

type PlanningServiceDeps = {
  taskPlanRepository: () => TaskPlanRepository | undefined
  scheduledTaskRepository: () => ScheduledTaskRepository | undefined
}

export class PlanningService {
  constructor(private readonly deps: PlanningServiceDeps) {}

  saveTaskPlan(plan: Plan): void {
    this.requireTaskPlanRepository().saveTaskPlan(plan)
  }

  updateTaskPlan(plan: Plan): void {
    this.requireTaskPlanRepository().updateTaskPlan(plan)
  }

  updateTaskPlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void {
    this.requireTaskPlanRepository().updateTaskPlanStatus(id, status, currentStepId, failureReason)
  }

  getTaskPlanById(id: string): Plan | undefined {
    return this.requireTaskPlanRepository().getTaskPlanById(id)
  }

  getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    return this.requireTaskPlanRepository().getTaskPlansByChatUuid(chatUuid)
  }

  deleteTaskPlan(id: string): void {
    this.requireTaskPlanRepository().deleteTaskPlan(id)
  }

  saveTaskPlanSteps(planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void {
    this.requireTaskPlanRepository().saveTaskPlanSteps(planId, steps, createdAt, updatedAt)
  }

  upsertTaskPlanStep(planId: string, step: PlanStep): void {
    this.requireTaskPlanRepository().upsertTaskPlanStep(planId, step)
  }

  updateTaskPlanStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): void {
    this.requireTaskPlanRepository().updateTaskPlanStepStatus(planId, stepId, status, output, error, notes)
  }

  saveScheduledTask(task: ScheduledTaskRow): void {
    this.requireScheduledTaskRepository().saveScheduledTask(task)
  }

  updateScheduledTask(task: ScheduledTaskRow): void {
    this.requireScheduledTaskRepository().updateScheduledTask(task)
  }

  updateScheduledTaskStatus(
    id: string,
    status: ScheduleTaskStatus,
    attemptCount: number,
    lastError?: string,
    resultMessageId?: number
  ): void {
    this.requireScheduledTaskRepository().updateScheduledTaskStatus(id, status, attemptCount, lastError, resultMessageId)
  }

  getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    return this.requireScheduledTaskRepository().getScheduledTaskById(id)
  }

  getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().getScheduledTasksByChatUuid(chatUuid)
  }

  getScheduledTasksByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().getScheduledTasksByStatus(status, limit)
  }

  claimDueScheduledTasks(now: number, limit: number): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().claimDueScheduledTasks(now, limit)
  }

  deleteScheduledTask(id: string): void {
    this.requireScheduledTaskRepository().deleteScheduledTask(id)
  }

  private requireTaskPlanRepository(): TaskPlanRepository {
    const repository = this.deps.taskPlanRepository()
    if (!repository) throw new Error('Task plan repository not initialized')
    return repository
  }

  private requireScheduledTaskRepository(): ScheduledTaskRepository {
    const repository = this.deps.scheduledTaskRepository()
    if (!repository) throw new Error('Scheduled task repository not initialized')
    return repository
  }
}
