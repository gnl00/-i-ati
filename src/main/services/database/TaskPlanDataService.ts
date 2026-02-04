import type { TaskPlanRepository, TaskPlanRow, TaskPlanStepRow } from '@main/db/repositories/TaskPlanRepository'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

type TaskPlanDataServiceDeps = {
  hasDb: () => boolean
  getTaskPlanRepo: () => TaskPlanRepository | undefined
}

export class TaskPlanDataService {
  constructor(private readonly deps: TaskPlanDataServiceDeps) {}

  saveTaskPlan(plan: Plan): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const now = Date.now()
    const row: TaskPlanRow = {
      id: plan.id,
      chat_uuid: plan.chatUuid ?? null,
      goal: plan.goal,
      context: plan.context ? JSON.stringify(plan.context) : null,
      constraints: plan.constraints ? JSON.stringify(plan.constraints) : null,
      status: plan.status,
      current_step_id: plan.currentStepId ?? null,
      failure_reason: plan.failureReason ?? null,
      created_at: plan.createdAt ?? now,
      updated_at: plan.updatedAt ?? now
    }
    taskPlanRepo.insertPlan(row)
    this.saveTaskPlanSteps(plan.id, plan.steps, row.created_at, row.updated_at)
  }

  updateTaskPlan(plan: Plan): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const now = Date.now()
    const row: TaskPlanRow = {
      id: plan.id,
      chat_uuid: plan.chatUuid ?? null,
      goal: plan.goal,
      context: plan.context ? JSON.stringify(plan.context) : null,
      constraints: plan.constraints ? JSON.stringify(plan.constraints) : null,
      status: plan.status,
      current_step_id: plan.currentStepId ?? null,
      failure_reason: plan.failureReason ?? null,
      created_at: plan.createdAt ?? now,
      updated_at: plan.updatedAt ?? now
    }
    taskPlanRepo.updatePlan(row)
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
    return this.mapTaskPlanRow(row, steps)
  }

  getTaskPlansByChatUuid(chatUuid: string): Plan[] {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const rows = taskPlanRepo.getPlansByChatUuid(chatUuid)
    return rows.map(row => this.mapTaskPlanRow(row, this.getTaskPlanSteps(row.id)))
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
      const row: TaskPlanStepRow = {
        id: step.id,
        plan_id: planId,
        title: step.title,
        status: step.status,
        depends_on: step.dependsOn ? JSON.stringify(step.dependsOn) : null,
        tool: step.tool ?? null,
        input: step.input ? JSON.stringify(step.input) : null,
        output: step.output ? JSON.stringify(step.output) : null,
        error: step.error ?? null,
        notes: step.notes ?? null,
        created_at: created,
        updated_at: updated
      }
      taskPlanRepo.insertStep(row)
    }
  }

  upsertTaskPlanStep(planId: string, step: PlanStep): void {
    const taskPlanRepo = this.requireTaskPlanRepo()
    const now = Date.now()
    const row: TaskPlanStepRow = {
      id: step.id,
      plan_id: planId,
      title: step.title,
      status: step.status,
      depends_on: step.dependsOn ? JSON.stringify(step.dependsOn) : null,
      tool: step.tool ?? null,
      input: step.input ? JSON.stringify(step.input) : null,
      output: step.output ? JSON.stringify(step.output) : null,
      error: step.error ?? null,
      notes: step.notes ?? null,
      created_at: now,
      updated_at: now
    }
    taskPlanRepo.upsertStep(row)
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
      output ? JSON.stringify(output) : null,
      error ?? null,
      notes ?? null,
      Date.now()
    )
  }

  private getTaskPlanSteps(planId: string): TaskPlanStepRow[] {
    const taskPlanRepo = this.requireTaskPlanRepo()
    return taskPlanRepo.getStepsByPlanId(planId)
  }

  private mapTaskPlanRow(row: TaskPlanRow, steps: TaskPlanStepRow[]): Plan {
    return {
      id: row.id,
      chatUuid: row.chat_uuid ?? undefined,
      goal: row.goal,
      context: row.context ? JSON.parse(row.context) : undefined,
      constraints: row.constraints ? JSON.parse(row.constraints) : undefined,
      status: row.status as PlanStatus,
      currentStepId: row.current_step_id ?? undefined,
      failureReason: row.failure_reason ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      steps: steps.map(step => ({
        id: step.id,
        title: step.title,
        status: step.status as PlanStep['status'],
        dependsOn: step.depends_on ? JSON.parse(step.depends_on) : undefined,
        tool: step.tool ?? undefined,
        input: step.input ? JSON.parse(step.input) : undefined,
        output: step.output ? JSON.parse(step.output) : undefined,
        error: step.error ?? undefined,
        notes: step.notes ?? undefined
      }))
    }
  }

  private requireTaskPlanRepo(): TaskPlanRepository {
    if (!this.deps.hasDb()) throw new Error('Database not initialized')
    const repo = this.deps.getTaskPlanRepo()
    if (!repo) throw new Error('Task plan repository not initialized')
    return repo
  }
}
