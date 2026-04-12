import type { TaskPlanRow, TaskPlanStepRow } from '@main/db/dao/TaskPlanDao'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

const stringifyNullable = (value: unknown): string | null => (
  value === undefined ? null : JSON.stringify(value)
)

export const toTaskPlanRow = (plan: Plan, now = Date.now()): TaskPlanRow => ({
  id: plan.id,
  chat_uuid: plan.chatUuid ?? null,
  goal: plan.goal,
  context: stringifyNullable(plan.context),
  constraints: stringifyNullable(plan.constraints),
  status: plan.status,
  current_step_id: plan.currentStepId ?? null,
  failure_reason: plan.failureReason ?? null,
  created_at: plan.createdAt ?? now,
  updated_at: plan.updatedAt ?? now
})

export const toTaskPlanStepRow = (
  planId: string,
  step: PlanStep,
  now = Date.now(),
  overrides: Partial<Pick<TaskPlanStepRow, 'created_at' | 'updated_at'>> = {}
): TaskPlanStepRow => ({
  id: step.id,
  plan_id: planId,
  title: step.title,
  status: step.status,
  depends_on: stringifyNullable(step.dependsOn),
  tool: step.tool ?? null,
  input: stringifyNullable(step.input),
  output: stringifyNullable(step.output),
  error: step.error ?? null,
  notes: step.notes ?? null,
  created_at: overrides.created_at ?? now,
  updated_at: overrides.updated_at ?? now
})

export const toTaskPlanEntity = (row: TaskPlanRow, steps: TaskPlanStepRow[]): Plan => ({
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
  steps: steps.map(toTaskPlanStepEntity)
})

export const toTaskPlanStepEntity = (row: TaskPlanStepRow): PlanStep => ({
  id: row.id,
  title: row.title,
  status: row.status as PlanStep['status'],
  dependsOn: row.depends_on ? JSON.parse(row.depends_on) : undefined,
  tool: row.tool ?? undefined,
  input: row.input ? JSON.parse(row.input) : undefined,
  output: row.output ? JSON.parse(row.output) : undefined,
  error: row.error ?? undefined,
  notes: row.notes ?? undefined
})

export const toTaskPlanStepStatusOutput = (output?: unknown): string | null => (
  output === undefined ? null : JSON.stringify(output)
)
