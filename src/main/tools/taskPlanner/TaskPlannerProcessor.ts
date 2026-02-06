import { v4 as uuidv4 } from 'uuid'
import DatabaseService from '@main/services/DatabaseService'
import type { Plan, PlanStatus, PlanStep } from '@shared/task-planner/schemas'

type PlanCreateArgs = {
  goal: string
  chat_uuid?: string
  context?: Record<string, any>
  constraints?: Plan['constraints']
  steps: PlanStep[]
}

type PlanUpdateArgs = {
  plan: Plan
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


export async function processPlanCreate(args: PlanCreateArgs) {
  try {
    if (!Array.isArray(args.steps)) {
      return { success: false, message: 'steps must be an array', reason: 'invalid_steps' }
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
    DatabaseService.saveTaskPlan(plan)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to create plan:', error)
    return { success: false, message }
  }
}

export async function processPlanUpdate(args: PlanUpdateArgs) {
  try {
    DatabaseService.updateTaskPlan({
      ...args.plan,
      updatedAt: Date.now()
    })
    const plan = DatabaseService.getTaskPlanById(args.plan.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to update plan:', error)
    return { success: false, message }
  }
}

export async function processPlanUpdateStatus(args: PlanUpdateStatusArgs) {
  try {
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
      const planForStep = DatabaseService.getTaskPlanById(args.id)
      if (planForStep && args.stepStatus === 'doing') {
        const index = planForStep.steps.findIndex(step => step.id === args.stepId)
        if (index > 0) {
          const prevStep = planForStep.steps[index - 1]
          if (prevStep && prevStep.status !== 'done') {
            DatabaseService.updateTaskPlanStepStatus(args.id, prevStep.id, 'done')
          }
        }
      }
      DatabaseService.updateTaskPlanStepStatus(args.id, args.stepId, args.stepStatus)
      const updatedPlan = DatabaseService.getTaskPlanById(args.id)
      if (updatedPlan) {
        const allDone = updatedPlan.steps.length > 0
          && updatedPlan.steps.every(step => step.status === 'done' || step.status === 'skipped')
        if (allDone) {
          nextStatus = 'completed'
        }
      }
    }
    DatabaseService.updateTaskPlanStatus(args.id, nextStatus, args.currentStepId, args.failureReason)
    const plan = DatabaseService.getTaskPlanById(args.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to update plan status:', error)
    return { success: false, message }
  }
}

export async function processPlanGetById(args: PlanGetByIdArgs) {
  try {
    const plan = DatabaseService.getTaskPlanById(args.id)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to get plan by id:', error)
    return { success: false, message }
  }
}

export async function processPlanGetCurrentChat(args: PlanGetCurrentChatArgs = {}) {
  try {
    const chatUuid = args.chat_uuid
    if (!chatUuid) {
      return { success: false, message: 'chat_uuid is required' }
    }
    const plans = DatabaseService.getTaskPlansByChatUuid(chatUuid)
    return { success: true, plans }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to get plans by chat uuid:', error)
    return { success: false, message }
  }
}

export async function processPlanDelete(args: PlanDeleteArgs) {
  try {
    DatabaseService.deleteTaskPlan(args.id)
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to delete plan:', error)
    return { success: false, message }
  }
}

export async function processPlanStepUpsert(args: PlanStepUpsertArgs) {
  try {
    DatabaseService.upsertTaskPlanStep(args.planId, args.step)
    const plan = DatabaseService.getTaskPlanById(args.planId)
    return { success: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[TaskPlanner] Failed to upsert plan step:', error)
    return { success: false, message }
  }
}
