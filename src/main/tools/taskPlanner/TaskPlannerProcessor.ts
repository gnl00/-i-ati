import { v4 as uuidv4 } from 'uuid'
import { planningDb } from '@main/db/planning'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'
import type { PlanAction, PlanResponse } from '@shared/tools/plan'

type PlanCreateArgs = {
  goal: string
  chat_uuid?: string
  context?: Record<string, any>
  constraints?: Plan['constraints']
  steps: PlanStep[]
}

type PlanUpdateArgs = {
  plan: Partial<Plan> & Pick<Plan, 'id'>
}

type PlanUpdateStatusArgs = {
  id: string
  status: PlanStatus
  currentStepId?: string
  failureReason?: string
  stepId?: string
  stepStatus?: PlanStep['status']
}

type PlanGetByIdArgs = {
  id: string
}

type PlanGetCurrentChatArgs = {
  chat_uuid?: string
}

type PlanDeleteArgs = {
  id: string
}

type PlanStepUpsertArgs = {
  planId: string
  step: PlanStep
}

type PlanArgs = {
  action?: PlanAction | string
  chat_uuid?: string
  goal?: string
  context?: Record<string, any>
  constraints?: Plan['constraints']
  steps?: PlanStep[]
  plan?: Partial<Plan> & Pick<Plan, 'id'>
  id?: string
  status?: PlanStatus
  currentStepId?: string
  failureReason?: string
  stepId?: string
  stepStatus?: PlanStep['status']
  planId?: string
  step?: PlanStep
}

const PLAN_ACTIONS: PlanAction[] = [
  'create',
  'update',
  'update_status',
  'get_by_id',
  'get_current_chat',
  'delete',
  'step_upsert'
]

function hasRequiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export async function processPlan(args: PlanArgs = {}): Promise<PlanResponse> {
  const action = typeof args?.action === 'string' ? args.action.trim() : ''

  if (!action) {
    return { success: false, message: 'Missing required parameter: action' }
  }

  switch (action) {
    case 'create':
      if (!hasRequiredString(args.goal)) {
        return { success: false, message: 'goal is required' }
      }
      if (!Array.isArray(args.steps)) {
        return { success: false, message: 'steps is required' }
      }
      return processPlanCreate({
        chat_uuid: args.chat_uuid,
        goal: args.goal,
        context: args.context,
        constraints: args.constraints,
        steps: args.steps
      })
    case 'update':
      if (!args.plan || !hasRequiredString(args.plan.id)) {
        return { success: false, message: 'plan.id is required' }
      }
      return processPlanUpdate({ plan: args.plan })
    case 'update_status':
      if (!hasRequiredString(args.id)) {
        return { success: false, message: 'id is required' }
      }
      if (!hasRequiredString(args.status)) {
        return { success: false, message: 'status is required' }
      }
      return processPlanUpdateStatus({
        id: args.id,
        status: args.status as PlanStatus,
        currentStepId: args.currentStepId,
        failureReason: args.failureReason,
        stepId: args.stepId,
        stepStatus: args.stepStatus
      })
    case 'get_by_id':
      if (!hasRequiredString(args.id)) {
        return { success: false, message: 'id is required' }
      }
      return processPlanGetById({ id: args.id })
    case 'get_current_chat':
      return processPlanGetCurrentChat({ chat_uuid: args.chat_uuid })
    case 'delete':
      if (!hasRequiredString(args.id)) {
        return { success: false, message: 'id is required' }
      }
      return processPlanDelete({ id: args.id })
    case 'step_upsert':
      if (!hasRequiredString(args.planId)) {
        return { success: false, message: 'planId is required' }
      }
      if (!args.step || typeof args.step !== 'object' || Array.isArray(args.step)) {
        return { success: false, message: 'step is required' }
      }
      return processPlanStepUpsert({ planId: args.planId, step: args.step })
    default:
      return {
        success: false,
        message: `Invalid action: ${action}. Expected one of: ${PLAN_ACTIONS.join(', ')}`
      }
  }
}

const mergePlanUpdate = (existing: Plan, update: PlanUpdateArgs['plan'], updatedAt: number): Plan => ({
  id: existing.id,
  chatUuid: update.chatUuid ?? existing.chatUuid,
  goal: update.goal ?? existing.goal,
  context: update.context ?? existing.context,
  constraints: update.constraints ?? existing.constraints,
  status: update.status ?? existing.status,
  currentStepId: update.currentStepId ?? existing.currentStepId,
  failureReason: update.failureReason ?? existing.failureReason,
  steps: update.steps ?? existing.steps,
  createdAt: existing.createdAt,
  updatedAt
})

async function processPlanCreate(args: PlanCreateArgs) {
  try {
    if (!hasRequiredString(args.goal)) {
      return { success: false, message: 'goal is required' }
    }
    if (!Array.isArray(args.steps)) {
      return { success: false, message: 'steps is required', reason: 'invalid_steps' }
    }
    const now = Date.now()
    const planId = uuidv4()
    const normalizeStepId = (id: string) => {
      if (id.startsWith(`${planId}-`)) return id
      return `${planId}-${id}`
    }
    const steps = args.steps.map(step => {
      const nextId = normalizeStepId(step.id)
      const dependsOn = step.dependsOn?.map(dep => normalizeStepId(dep))
      return {
        ...step,
        id: nextId,
        dependsOn
      }
    })
    const plan: Plan = {
      id: planId,
      chatUuid: args.chat_uuid,
      goal: args.goal,
      context: args.context,
      constraints: args.constraints,
      status: 'pending',
      steps,
      createdAt: now,
      updatedAt: now
    }
    planningDb.saveTaskPlan(plan)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to create plan:', error)
    return { success: false, message }
  }
}

async function processPlanUpdate(args: PlanUpdateArgs) {
  try {
    if (!args.plan?.id) {
      return { success: false, message: 'plan.id is required' }
    }
    const existingPlan = planningDb.getTaskPlanById(args.plan.id)
    if (!existingPlan) {
      return { success: false, message: `Plan not found: ${args.plan.id}` }
    }
    planningDb.updateTaskPlan({
      ...mergePlanUpdate(existingPlan, args.plan, Date.now())
    })
    const plan = planningDb.getTaskPlanById(args.plan.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to update plan:', error)
    return { success: false, message }
  }
}

async function processPlanUpdateStatus(args: PlanUpdateStatusArgs) {
  try {
    if (!hasRequiredString(args.id)) {
      return { success: false, message: 'id is required' }
    }
    if (!hasRequiredString(args.status)) {
      return { success: false, message: 'status is required' }
    }
    const allowedStatuses: PlanStatus[] = ['pending', 'pending_review', 'running', 'paused', 'completed', 'failed', 'cancelled']
    if (!allowedStatuses.includes(args.status)) {
      return { success: false, message: `Invalid plan status: ${args.status}` }
    }
    let nextStatus: PlanStatus = args.status
    if (args.stepStatus) {
      const allowedStepStatuses: PlanStep['status'][] = ['todo', 'doing', 'done', 'failed', 'skipped']
      if (!allowedStepStatuses.includes(args.stepStatus)) {
        return { success: false, message: `Invalid step status: ${args.stepStatus}` }
      }
      if (!args.stepId) {
        return { success: false, message: 'stepId is required when stepStatus is provided' }
      }
      const planForStep = planningDb.getTaskPlanById(args.id)
      if (planForStep && args.stepStatus === 'doing') {
        const index = planForStep.steps.findIndex(step => step.id === args.stepId)
        if (index > 0) {
          const prevStep = planForStep.steps[index - 1]
          if (prevStep && prevStep.status !== 'done') {
            planningDb.updateTaskPlanStepStatus(args.id, prevStep.id, 'done')
          }
        }
      }
      planningDb.updateTaskPlanStepStatus(args.id, args.stepId, args.stepStatus)
      const updatedPlan = planningDb.getTaskPlanById(args.id)
      if (updatedPlan) {
        const allDone = updatedPlan.steps.length > 0
          && updatedPlan.steps.every(step => step.status === 'done' || step.status === 'skipped')
        if (allDone) {
          nextStatus = 'completed'
        }
      }
    }
    planningDb.updateTaskPlanStatus(args.id, nextStatus, args.currentStepId, args.failureReason)
    const plan = planningDb.getTaskPlanById(args.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to update plan status:', error)
    return { success: false, message }
  }
}

async function processPlanGetById(args: PlanGetByIdArgs) {
  try {
    if (!hasRequiredString(args.id)) {
      return { success: false, message: 'id is required' }
    }
    const plan = planningDb.getTaskPlanById(args.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to get plan by id:', error)
    return { success: false, message }
  }
}

async function processPlanGetCurrentChat(args: PlanGetCurrentChatArgs = {}) {
  try {
    const chatUuid = args.chat_uuid
    if (!chatUuid) {
      return { success: false, message: 'chat_uuid is required' }
    }
    const plans = planningDb.getTaskPlansByChatUuid(chatUuid)
    return { success: true, plans }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to get plans by chat uuid:', error)
    return { success: false, message }
  }
}

async function processPlanDelete(args: PlanDeleteArgs) {
  try {
    if (!hasRequiredString(args.id)) {
      return { success: false, message: 'id is required' }
    }
    planningDb.deleteTaskPlan(args.id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to delete plan:', error)
    return { success: false, message }
  }
}

async function processPlanStepUpsert(args: PlanStepUpsertArgs) {
  try {
    if (!hasRequiredString(args.planId)) {
      return { success: false, message: 'planId is required' }
    }
    if (!args.step || typeof args.step !== 'object' || Array.isArray(args.step)) {
      return { success: false, message: 'step is required' }
    }
    planningDb.upsertTaskPlanStep(args.planId, args.step)
    const plan = planningDb.getTaskPlanById(args.planId)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to upsert plan step:', error)
    return { success: false, message }
  }
}
