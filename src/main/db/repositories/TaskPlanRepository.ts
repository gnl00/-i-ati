import type Database from 'better-sqlite3'

interface TaskPlanRow {
  id: string
  chat_uuid: string | null
  goal: string
  context: string | null
  constraints: string | null
  status: string
  current_step_id: string | null
  failure_reason: string | null
  created_at: number
  updated_at: number
}

interface TaskPlanStepRow {
  id: string
  plan_id: string
  title: string
  status: string
  depends_on: string | null
  tool: string | null
  input: string | null
  output: string | null
  error: string | null
  notes: string | null
  created_at: number
  updated_at: number
}

class TaskPlanRepository {
  private stmts: {
    insertPlan: Database.Statement
    updatePlan: Database.Statement
    updatePlanStatus: Database.Statement
    getPlanById: Database.Statement
    getPlansByChatUuid: Database.Statement
    deletePlan: Database.Statement
    insertStep: Database.Statement
    upsertStep: Database.Statement
    updateStep: Database.Statement
    updateStepStatus: Database.Statement
    getStepsByPlanId: Database.Statement
    deleteStepsByPlanId: Database.Statement
    deleteStepById: Database.Statement
  }

  constructor(db: Database.Database) {
    this.stmts = {
      insertPlan: db.prepare(`
        INSERT INTO task_plans (
          id, chat_uuid, goal, context, constraints, status,
          current_step_id, failure_reason, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updatePlan: db.prepare(`
        UPDATE task_plans SET
          chat_uuid = ?,
          goal = ?,
          context = ?,
          constraints = ?,
          status = ?,
          current_step_id = ?,
          failure_reason = ?,
          updated_at = ?
        WHERE id = ?
      `),
      updatePlanStatus: db.prepare(`
        UPDATE task_plans SET
          status = ?,
          current_step_id = ?,
          failure_reason = ?,
          updated_at = ?
        WHERE id = ?
      `),
      getPlanById: db.prepare(`
        SELECT * FROM task_plans WHERE id = ?
      `),
      getPlansByChatUuid: db.prepare(`
        SELECT * FROM task_plans WHERE chat_uuid = ? ORDER BY updated_at DESC
      `),
      deletePlan: db.prepare(`
        DELETE FROM task_plans WHERE id = ?
      `),
      insertStep: db.prepare(`
        INSERT INTO task_plan_steps (
          id, plan_id, title, status, depends_on, tool, input, output, error, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      upsertStep: db.prepare(`
        INSERT OR REPLACE INTO task_plan_steps (
          id, plan_id, title, status, depends_on, tool, input, output, error, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      updateStep: db.prepare(`
        UPDATE task_plan_steps SET
          title = ?,
          status = ?,
          depends_on = ?,
          tool = ?,
          input = ?,
          output = ?,
          error = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ? AND plan_id = ?
      `),
      updateStepStatus: db.prepare(`
        UPDATE task_plan_steps SET
          status = ?,
          output = ?,
          error = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ? AND plan_id = ?
      `),
      getStepsByPlanId: db.prepare(`
        SELECT * FROM task_plan_steps WHERE plan_id = ? ORDER BY created_at ASC
      `),
      deleteStepsByPlanId: db.prepare(`
        DELETE FROM task_plan_steps WHERE plan_id = ?
      `),
      deleteStepById: db.prepare(`
        DELETE FROM task_plan_steps WHERE id = ? AND plan_id = ?
      `)
    }
  }

  insertPlan(row: TaskPlanRow): void {
    this.stmts.insertPlan.run(
      row.id,
      row.chat_uuid,
      row.goal,
      row.context,
      row.constraints,
      row.status,
      row.current_step_id,
      row.failure_reason,
      row.created_at,
      row.updated_at
    )
  }

  updatePlan(row: TaskPlanRow): void {
    this.stmts.updatePlan.run(
      row.chat_uuid,
      row.goal,
      row.context,
      row.constraints,
      row.status,
      row.current_step_id,
      row.failure_reason,
      row.updated_at,
      row.id
    )
  }

  updatePlanStatus(id: string, status: string, currentStepId: string | null, failureReason: string | null, updatedAt: number): void {
    this.stmts.updatePlanStatus.run(status, currentStepId, failureReason, updatedAt, id)
  }

  getPlanById(id: string): TaskPlanRow | undefined {
    return this.stmts.getPlanById.get(id) as TaskPlanRow | undefined
  }

  getPlansByChatUuid(chatUuid: string): TaskPlanRow[] {
    return this.stmts.getPlansByChatUuid.all(chatUuid) as TaskPlanRow[]
  }

  deletePlan(id: string): void {
    this.stmts.deletePlan.run(id)
  }

  insertStep(row: TaskPlanStepRow): void {
    this.stmts.insertStep.run(
      row.id,
      row.plan_id,
      row.title,
      row.status,
      row.depends_on,
      row.tool,
      row.input,
      row.output,
      row.error,
      row.notes,
      row.created_at,
      row.updated_at
    )
  }

  upsertStep(row: TaskPlanStepRow): void {
    this.stmts.upsertStep.run(
      row.id,
      row.plan_id,
      row.title,
      row.status,
      row.depends_on,
      row.tool,
      row.input,
      row.output,
      row.error,
      row.notes,
      row.created_at,
      row.updated_at
    )
  }

  updateStep(row: TaskPlanStepRow): void {
    this.stmts.updateStep.run(
      row.title,
      row.status,
      row.depends_on,
      row.tool,
      row.input,
      row.output,
      row.error,
      row.notes,
      row.updated_at,
      row.id,
      row.plan_id
    )
  }

  updateStepStatus(
    planId: string,
    stepId: string,
    status: string,
    output: string | null,
    error: string | null,
    notes: string | null,
    updatedAt: number
  ): void {
    this.stmts.updateStepStatus.run(status, output, error, notes, updatedAt, stepId, planId)
  }

  getStepsByPlanId(planId: string): TaskPlanStepRow[] {
    return this.stmts.getStepsByPlanId.all(planId) as TaskPlanStepRow[]
  }

  deleteStepsByPlanId(planId: string): void {
    this.stmts.deleteStepsByPlanId.run(planId)
  }

  deleteStepById(planId: string, stepId: string): void {
    this.stmts.deleteStepById.run(stepId, planId)
  }
}

export { TaskPlanRepository }
export type { TaskPlanRow, TaskPlanStepRow }
