import type { TaskPlanDao, TaskPlanStepRow } from '@main/db/dao/TaskPlanDao'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import {
  toTaskPlanEntity,
  toTaskPlanRow,
  toTaskPlanStepRow,
  toTaskPlanStepStatusOutput
} from '@main/db/mappers/TaskPlanMapper'

type TaskPlanRepositoryDeps = {
  hasDb: () => boolean
  getTaskPlanRepo: () => TaskPlanDao | undefined
}

export class TaskPlanRepository {
  constructor(private readonly deps: TaskPlanRepositoryDeps) {}

  saveTaskPlan(plan: Plan): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const row = toTaskPlanRow(plan)
    taskPlanRepo.insertPlan(row)
    this.saveTaskPlanSteps(plan.id, plan.steps, row.created_at, row.updated_at)
  }

  updateTaskPlan(plan: Plan): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    taskPlanRepo.updatePlan(toTaskPlanRow(plan))
  }

  updateTaskPlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    taskPlanRepo.updatePlanStatus(id, status, currentStepId ?? null, failureReason ?? null, Date.now())
  }

  getTaskPlanById(id: string): Plan | undefined {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const row = taskPlanRepo.getPlanById(id)
    if (!row) return undefined
    const steps = this.getTaskPlanSteps(row.id)
    return toTaskPlanEntity(row, steps)
  }

  getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const rows = taskPlanRepo.getPlansByChatUuid(chatUuid)
    return rows.map(row => toTaskPlanEntity(row, this.getTaskPlanSteps(row.id)))
  }

  deleteTaskPlan(id: string): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    taskPlanRepo.deletePlan(id)
  }

  saveTaskPlanSteps(planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const created = createdAt ?? Date.now()
    const updated = updatedAt ?? created
    for (const step of steps) {
      taskPlanRepo.insertStep(toTaskPlanStepRow(planId, step, created, {
        created_at: created,
        updated_at: updated
      }))
    }
  }

  upsertTaskPlanStep(planId: string, step: PlanStep): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    taskPlanRepo.upsertStep(toTaskPlanStepRow(planId, step))
  }

  updateTaskPlanStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    taskPlanRepo.updateStepStatus(
      planId,
      stepId,
      status,
      toTaskPlanStepStatusOutput(output),
      error ?? null,
      notes ?? null,
      Date.now()
    )
  }

  private getTaskPlanSteps(planId: string): TaskPlanStepRow[] {
    const taskPlanRepo = this.requireTaskPlanRepo()
    return taskPlanRepo.getStepsByPlanId(planId)
  }
  private requireTaskPlanRepo(): TaskPlanDao {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getTaskPlanRepo()
    if (!repo) throw new Error('Task plan repository not initialized')
    return repo
  }
}
