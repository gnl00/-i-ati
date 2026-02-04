import { useCallback, useEffect, useRef, useState } from 'react'
import { invokeChatSubmitToolConfirm, subscribeChatSubmitEvents } from '@renderer/invoker/ipcInvoker'
import { taskPlannerService } from '@renderer/services/taskPlanner/TaskPlannerService'
import type { Plan } from '@shared/task-planner/schemas'

type UseTaskPlanResult = {
  activePlans: Plan[]
  pendingPlanReview: { toolCallId: string; plan: Plan } | null
  refreshPlans: () => void
  approvePlanReview: () => Promise<void>
  abortPlanReview: (reason?: string) => Promise<void>
}

export function useTaskPlan(chatUuid: string | null | undefined): UseTaskPlanResult {
  const [activePlans, setActivePlans] = useState<Plan[]>([])
  const [pendingPlanReview, setPendingPlanReview] = useState<{ toolCallId: string; plan: Plan } | null>(null)
  const toolCallNameMapRef = useRef<Map<string, string>>(new Map())

  const refreshPlans = useCallback(() => {
    if (!chatUuid) {
      setActivePlans([])
      return
    }
    taskPlannerService.getPlansByChatUuid(chatUuid)
      .then(plans => {
        const filtered = plans.filter(plan => plan.status !== 'completed' && plan.status !== 'cancelled')
        filtered.sort((a, b) => b.updatedAt - a.updatedAt)
        setActivePlans(filtered)
      })
      .catch(() => {
        setActivePlans([])
      })
  }, [chatUuid])

  useEffect(() => {
    refreshPlans()
  }, [refreshPlans])

  useEffect(() => {
    setPendingPlanReview(null)
  }, [chatUuid])

  const approvePlanReview = useCallback(async () => {
    if (!pendingPlanReview) return
    await invokeChatSubmitToolConfirm({
      toolCallId: pendingPlanReview.toolCallId,
      approved: true
    })
    setPendingPlanReview(null)
    refreshPlans()
  }, [pendingPlanReview, refreshPlans])

  const abortPlanReview = useCallback(async (reason?: string) => {
    if (!pendingPlanReview) return
    await invokeChatSubmitToolConfirm({
      toolCallId: pendingPlanReview.toolCallId,
      approved: false,
      reason
    })
    setPendingPlanReview(null)
  }, [pendingPlanReview])

  useEffect(() => {
    const unsubscribe = subscribeChatSubmitEvents((event) => {
      if (chatUuid && event.chatUuid && event.chatUuid !== chatUuid) {
        return
      }

      if (event.type === 'tool.exec.requires_confirmation') {
        const payload = event.payload
        if (payload?.name === 'plan_create' && payload.toolCallId) {
          const args = payload.args as Partial<Plan> & { steps?: Plan['steps'] }
          const steps = Array.isArray(args?.steps) ? args.steps : []
          const draftPlan: Plan = {
            id: payload.toolCallId,
            chatUuid: chatUuid ?? undefined,
            goal: typeof args?.goal === 'string' ? args.goal : 'Untitled plan',
            context: args?.context,
            constraints: args?.constraints,
            status: 'pending_review',
            steps,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          setPendingPlanReview({ toolCallId: payload.toolCallId, plan: draftPlan })
        }
      }

      if (event.type === 'tool.call.detected') {
        const toolCall = event.payload.toolCall
        if (toolCall?.id && toolCall?.name) {
          toolCallNameMapRef.current.set(toolCall.id, toolCall.name)
        }
      }

      if (event.type === 'tool.exec.completed' || event.type === 'tool.exec.failed') {
        const toolCallId = event.payload.toolCallId
        if (!toolCallId) return
        if (pendingPlanReview?.toolCallId === toolCallId) {
          setPendingPlanReview(null)
        }
        const toolName = toolCallNameMapRef.current.get(toolCallId)
        const result = event.type === 'tool.exec.completed' ? event.payload.result : undefined
        const hasPlanResult = Boolean(result && (result.plan || result.plans))
        if (!hasPlanResult && (!toolName || !toolName.startsWith('plan_'))) {
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
