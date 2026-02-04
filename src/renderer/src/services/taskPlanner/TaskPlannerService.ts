import { v4 as uuidv4 } from 'uuid'
import {
  invokeDbTaskPlanDelete,
  invokeDbTaskPlanGetByChatUuid,
  invokeDbTaskPlanGetById,
  invokeDbTaskPlanSave,
  invokeDbTaskPlanStepUpdateStatus,
  invokeDbTaskPlanStepUpsert,
  invokeDbTaskPlanUpdate,
  invokeDbTaskPlanUpdateStatus
} from '@renderer/invoker/ipcInvoker'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

export interface TaskPlannerService {
  createPlan: (plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Plan>
  updatePlan: (plan: Plan) => Promise<void>
  updatePlanStatus: (id: string, status: PlanStatus, currentStepId?: string, failureReason?: string) => Promise<void>
  getPlanById: (id: string) => Promise<Plan | undefined>
  getPlansByChatUuid: (chatUuid: string) => Promise<Plan[]>
  deletePlan: (id: string) => Promise<void>
  upsertStep: (planId: string, step: PlanStep) => Promise<void>
  updateStepStatus: (
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ) => Promise<void>
}

class TaskPlannerServiceImpl implements TaskPlannerService {
  async createPlan(plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
    const now = Date.now()
    const fullPlan: Plan = {
      ...plan,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now
    }
    await invokeDbTaskPlanSave(fullPlan)
    return fullPlan
  }

  async updatePlan(plan: Plan): Promise<void> {
    await invokeDbTaskPlanUpdate({
      ...plan,
      updatedAt: Date.now()
    })
  }

  async updatePlanStatus(id: string, status: PlanStatus, currentStepId?: string, failureReason?: string): Promise<void> {
    await invokeDbTaskPlanUpdateStatus({ id, status, currentStepId, failureReason })
  }

  async getPlanById(id: string): Promise<Plan | undefined> {
    return await invokeDbTaskPlanGetById(id)
  }

  async getPlansByChatUuid(chatUuid: string): Promise<Plan[]> {
    return await invokeDbTaskPlanGetByChatUuid(chatUuid)
  }

  async deletePlan(id: string): Promise<void> {
    await invokeDbTaskPlanDelete(id)
  }

  async upsertStep(planId: string, step: PlanStep): Promise<void> {
    await invokeDbTaskPlanStepUpsert(planId, step)
  }

  async updateStepStatus(
    planId: string,
    stepId: string,
    status: PlanStep['status'],
    output?: unknown,
    error?: string,
    notes?: string
  ): Promise<void> {
    await invokeDbTaskPlanStepUpdateStatus(planId, stepId, status, output, error, notes)
  }
}

export const taskPlannerService = new TaskPlannerServiceImpl()
