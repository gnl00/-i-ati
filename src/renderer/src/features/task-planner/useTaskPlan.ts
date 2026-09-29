import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subscribeRunEvents } from '@renderer/infrastructure/ipc'
import { taskPlannerService } from '@renderer/features/task-planner/TaskPlannerService'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { ToolConfirmation } from '@shared/tools/confirmation'
import type { Plan } from '@shared/task-planner/schemas'

const sortPlanStepsById = (plan: Plan): Plan => ({
  ...plan,
  steps: [...plan.steps].sort((a, b) => a.id.localeCompare(b.id))
})

type UseTaskPlanResult = {
  activePlans: Plan[]
  pendingPlanReview: { toolCallId: string; plan: Plan } | null
  refreshPlans: () => void
  approvePlanReview: () => Promise<void>
  abortPlanReview: (reason?: string) => Promise<void>
}

type DetectedToolCall = {
  name: string
  action?: string
}

function readToolAction(args: unknown): string | undefined {
  let value = args
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const action = (value as { action?: unknown }).action
  return typeof action === 'string' ? action.trim() : undefined
}

export function useTaskPlan(chatUuid: string | null | undefined, approvals: {
  pending: ToolConfirmation[]
  confirm: (confirmationId: string) => Promise<void>
  cancel: (reason: string | undefined, confirmationId: string) => Promise<void>
}): UseTaskPlanResult {
  const [activePlans, setActivePlans] = useState<Plan[]>([])
  const { pending, confirm, cancel } = approvals
  const pendingApproval = pending.find(item => item.chatUuid === chatUuid && item.name === 'plan' && readToolAction(item.args) === 'create')
  const pendingPlanReview = useMemo(() => {
    if (!pendingApproval) return null
    const args = pendingApproval.args as Partial<Plan>
    return { toolCallId: pendingApproval.toolCallId, plan: sortPlanStepsById({
      id: pendingApproval.toolCallId, chatUuid: pendingApproval.chatUuid,
      goal: typeof args?.goal === 'string' ? args.goal : 'Untitled plan',
      context: args?.context, constraints: args?.constraints, status: 'pending_review',
      steps: Array.isArray(args?.steps) ? args.steps : [],
      createdAt: pendingApproval.createdAt, updatedAt: pendingApproval.createdAt
    }) }
  }, [pendingApproval])
  const toolCallMapRef = useRef<Map<string, DetectedToolCall>>(new Map())

  const refreshPlans = useCallback(() => {
    if (!chatUuid) {
      setActivePlans([])
      return
    }
    taskPlannerService.getPlansByChatUuid(chatUuid)
      .then(plans => {
        const filtered = plans.filter(plan => plan.status !== 'completed' && plan.status !== 'cancelled')
        filtered.sort((a, b) => b.updatedAt - a.updatedAt)
        setActivePlans(filtered.map(sortPlanStepsById))
      })
      .catch(() => {
        setActivePlans([])
      })
  }, [chatUuid])

  useEffect(() => {
    refreshPlans()
  }, [refreshPlans])

  const approvePlanReview = useCallback(async () => {
    if (!pendingApproval) return
    await confirm(pendingApproval.confirmationId)
    refreshPlans()
  }, [pendingApproval, confirm, refreshPlans])

  const abortPlanReview = useCallback(async (reason?: string) => {
    if (!pendingApproval) return
    await cancel(reason, pendingApproval.confirmationId)
  }, [pendingApproval, cancel])

  useEffect(() => {
    const unsubscribe = subscribeRunEvents((event) => {
      if (event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === RUN_TOOL_EVENTS.TOOL_CALL_DETECTED) {
        const toolCall = event.payload.toolCall
        if (toolCall?.id && toolCall?.name) {
          toolCallMapRef.current.set(toolCall.id, {
            name: toolCall.name,
            action: readToolAction(toolCall.args)
          })
        }
      }

      if (
        event.type === RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED
        || event.type === RUN_TOOL_EVENTS.TOOL_EXECUTION_FAILED
      ) {
        const toolCallId = event.payload.toolCallId
        if (!toolCallId) return
        const toolCall = toolCallMapRef.current.get(toolCallId)
        if (toolCall?.name !== 'plan' || !toolCall.action) {
          return
        }
        refreshPlans()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [chatUuid, refreshPlans])

  return { activePlans, pendingPlanReview, refreshPlans, approvePlanReview, abortPlanReview }
}
