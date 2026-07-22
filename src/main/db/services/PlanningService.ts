import type { ClaimedScheduledRun, ScheduledTaskRow, ScheduledTaskRunRow } from '../dao/ScheduledTaskDao'
import type { TodoListFilters, TodoRow } from '../dao/TodoDao'
import type { ScheduledTaskRepository } from '../repositories/ScheduledTaskRepository'
import type { TaskPlanRepository } from '../repositories/TaskPlanRepository'
import type { TodoRepository } from '../repositories/TodoRepository'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

type PlanningServiceDeps = {
  taskPlanRepository: () => TaskPlanRepository | undefined
  scheduledTaskRepository: () => ScheduledTaskRepository | undefined
  todoRepository: () => TodoRepository | undefined
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

  createScheduledTask(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void { this.requireScheduledTaskRepository().create(task, run) }
  updateScheduledTask(task: ScheduledTaskRow, run: ScheduledTaskRunRow): void { this.requireScheduledTaskRepository().update(task, run) }

  getScheduledTaskById(id: string): ScheduledTaskRow | undefined {
    return this.requireScheduledTaskRepository().getById(id)
  }

  getScheduledTasksByChatUuid(chatUuid: string): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().getByChatUuid(chatUuid)
  }

  getScheduledTasks(): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().listAll()
  }

  getScheduledTasksByStatus(status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] {
    return this.requireScheduledTaskRepository().listByStatus(status, limit)
  }

  getActiveScheduledTaskRun(taskId: string): ScheduledTaskRunRow | undefined { return this.requireScheduledTaskRepository().getActiveRun(taskId) }
  getScheduledTaskRuns(taskId: string, limit?: number): ScheduledTaskRunRow[] { return this.requireScheduledTaskRepository().listRuns(taskId, limit) }
  claimDueScheduledTaskRuns(now: number, limit: number): ClaimedScheduledRun[] { return this.requireScheduledTaskRepository().claimDue(now, limit) }
  startScheduledTaskRunAttempt(runId: string, submissionId: string, now: number): ScheduledTaskRunRow | undefined { return this.requireScheduledTaskRepository().startAttempt(runId, submissionId, now) }
  deferScheduledTaskRun(runId: string, nextAttemptAt: number, now: number): void { this.requireScheduledTaskRepository().defer(runId, nextAttemptAt, now) }
  completeScheduledTaskRun(runId: string, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void { this.requireScheduledTaskRepository().complete(runId, resultMessageId, nextRun, now) }
  failScheduledTaskRun(runId: string, error: string, retryAt: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void { this.requireScheduledTaskRepository().fail(runId, error, retryAt, nextRun, now) }
  cancelScheduledTask(taskId: string, reason: string, now: number): { submissionId: string | null } { return this.requireScheduledTaskRepository().cancel(taskId, reason, now) }
  dismissScheduledTask(taskId: string, now: number): void { this.requireScheduledTaskRepository().dismiss(taskId, now) }
  listRunningScheduledTaskRuns(): ClaimedScheduledRun[] { return this.requireScheduledTaskRepository().listRunning() }
  recoverScheduledTaskRun(runId: string, nextRun: ScheduledTaskRunRow | null, now: number): void { this.requireScheduledTaskRepository().recover(runId, nextRun, now) }

  deleteScheduledTask(id: string): void {
    this.requireScheduledTaskRepository().delete(id)
  }

  saveTodo(todo: TodoRow): void {
    this.requireTodoRepository().saveTodo(todo)
  }

  updateTodo(todo: TodoRow): void {
    this.requireTodoRepository().updateTodo(todo)
  }

  getTodoById(id: string): TodoRow | undefined {
    return this.requireTodoRepository().getTodoById(id)
  }

  listTodos(filters: TodoListFilters): TodoRow[] {
    return this.requireTodoRepository().listTodos(filters)
  }

  deleteTodo(id: string): void {
    this.requireTodoRepository().deleteTodo(id)
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

  private requireTodoRepository(): TodoRepository {
    const repository = this.deps.todoRepository()
    if (!repository) throw new Error('Todo repository not initialized')
    return repository
  }
}
