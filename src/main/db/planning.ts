import DatabaseService from './DatabaseService'
import type { ClaimedScheduledRun, ScheduledTaskRow, ScheduledTaskRunRow } from './dao/ScheduledTaskDao'
import type { ScheduleTaskStatus } from '@shared/tools/schedule'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import type { TodoListFilters, TodoRow } from './dao/TodoDao'

export const planningDb = {
  saveTaskPlan: (plan: Plan): void => DatabaseService.saveTaskPlan(plan),
  updateTaskPlan: (plan: Plan): void => DatabaseService.updateTaskPlan(plan),
  updateTaskPlanStatus: (id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): void => DatabaseService.updateTaskPlanStatus(id, status, currentStepId, failureReason),
  getTaskPlanById: (id: string): Plan | undefined => DatabaseService.getTaskPlanById(id),
  getTaskPlansByChatUuid: (chatUuid: string): Plan[] => DatabaseService.getTaskPlansByChatUuid(chatUuid),
  deleteTaskPlan: (id: string): void => DatabaseService.deleteTaskPlan(id),
  saveTaskPlanSteps: (planId: string, steps: PlanStep[], createdAt?: number, updatedAt?: number): void => DatabaseService.saveTaskPlanSteps(planId, steps, createdAt, updatedAt),
  upsertTaskPlanStep: (planId: string, step: PlanStep): void => DatabaseService.upsertTaskPlanStep(planId, step),
  updateTaskPlanStepStatus: (planId: string, stepId: string, status: PlanStep['status'], output?: unknown, error?: string, notes?: string): void => DatabaseService.updateTaskPlanStepStatus(planId, stepId, status, output, error, notes),

  createScheduledTask: (task: ScheduledTaskRow, run: ScheduledTaskRunRow): void => DatabaseService.createScheduledTask(task, run),
  updateScheduledTask: (task: ScheduledTaskRow, run: ScheduledTaskRunRow): void => DatabaseService.updateScheduledTask(task, run),
  getScheduledTaskById: (id: string): ScheduledTaskRow | undefined => DatabaseService.getScheduledTaskById(id),
  getScheduledTasksByChatUuid: (chatUuid: string): ScheduledTaskRow[] => DatabaseService.getScheduledTasksByChatUuid(chatUuid),
  getScheduledTasks: (): ScheduledTaskRow[] => DatabaseService.getScheduledTasks(),
  getScheduledTasksByStatus: (status: ScheduleTaskStatus, limit: number): ScheduledTaskRow[] => DatabaseService.getScheduledTasksByStatus(status, limit),
  getActiveScheduledTaskRun: (taskId: string): ScheduledTaskRunRow | undefined => DatabaseService.getActiveScheduledTaskRun(taskId),
  getScheduledTaskRuns: (taskId: string, limit?: number): ScheduledTaskRunRow[] => DatabaseService.getScheduledTaskRuns(taskId, limit),
  claimDueScheduledTaskRuns: (now: number, limit: number): ClaimedScheduledRun[] => DatabaseService.claimDueScheduledTaskRuns(now, limit),
  startScheduledTaskRunAttempt: (runId: string, submissionId: string, now: number): ScheduledTaskRunRow | undefined => DatabaseService.startScheduledTaskRunAttempt(runId, submissionId, now),
  deferScheduledTaskRun: (runId: string, nextAttemptAt: number, now: number): void => DatabaseService.deferScheduledTaskRun(runId, nextAttemptAt, now),
  completeScheduledTaskRun: (runId: string, resultMessageId: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void => DatabaseService.completeScheduledTaskRun(runId, resultMessageId, nextRun, now),
  failScheduledTaskRun: (runId: string, error: string, retryAt: number | null, nextRun: ScheduledTaskRunRow | null, now: number): void => DatabaseService.failScheduledTaskRun(runId, error, retryAt, nextRun, now),
  cancelScheduledTask: (taskId: string, reason: string, now: number): { submissionId: string | null } => DatabaseService.cancelScheduledTask(taskId, reason, now),
  dismissScheduledTask: (taskId: string, now: number): void => DatabaseService.dismissScheduledTask(taskId, now),
  listRunningScheduledTaskRuns: (): ClaimedScheduledRun[] => DatabaseService.listRunningScheduledTaskRuns(),
  recoverScheduledTaskRun: (runId: string, nextRun: ScheduledTaskRunRow | null, now: number): void => DatabaseService.recoverScheduledTaskRun(runId, nextRun, now),
  deleteScheduledTask: (id: string): void => DatabaseService.deleteScheduledTask(id),

  saveTodo: (todo: TodoRow): void => DatabaseService.saveTodo(todo),
  updateTodo: (todo: TodoRow): void => DatabaseService.updateTodo(todo),
  getTodoById: (id: string): TodoRow | undefined => DatabaseService.getTodoById(id),
  listTodos: (filters: TodoListFilters): TodoRow[] => DatabaseService.listTodos(filters),
  deleteTodo: (id: string): void => DatabaseService.deleteTodo(id)
}
