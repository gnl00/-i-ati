import { useEffect, useRef } from 'react'
import { SCHEDULE_EVENTS } from '@shared/schedule/events'
import { subscribeRunEvents, subscribeScheduleEvents } from '@renderer/infrastructure/ipc'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { bindChatRunEvents, type BindChatRunEventsInput } from '@renderer/features/chat/runtime/chatRunEvent'
import { toast } from 'sonner'
import type { ScheduleEvent } from '@renderer/infrastructure/ipc'
import type { RunEvent } from '@shared/run/events'
import type { LastRunErrorMessage } from '@renderer/features/chat/runtime/reconcileRunErrorMessage'
import type { ScheduleTask, ScheduleTaskRun } from '@shared/tools/schedule'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'

type ScheduleRunBinding = {
  chatUuid: string
  runCompletedRef: { current: boolean }
  unsubscribe: (() => void) | null
}

function resolveExecutionChatUuid(
  task: ScheduleTask,
  run: ScheduleTaskRun,
  executionChat?: ChatEntity
): string {
  return run.execution_chat_uuid ?? executionChat?.uuid ?? task.chat_uuid
}

function runOutcome(
  status: ScheduleTaskRun['status']
): 'completed' | 'failed' | 'aborted' | undefined {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'aborted'
  return undefined
}

export function useScheduleNotifications(chatUuid?: string | null): void {
  const chatUuidRef = useRef(chatUuid)
  chatUuidRef.current = chatUuid

  useEffect(() => {
    const activeBindings = new Map<string, ScheduleRunBinding>()
    const backgroundTitleUnsubscribers = new Map<string, () => void>()

    const resetRunLifecycle: BindChatRunEventsInput['resetRunLifecycle'] = (outcome = 'idle', targetChatUuid) => {
      const latestStore = useChatStore.getState()
      if (targetChatUuid) {
        latestStore.setRunPhaseForChat(targetChatUuid, 'idle')
        latestStore.resetPostRunJobsForChat(targetChatUuid)
        latestStore.setLastRunOutcomeForChat(targetChatUuid, outcome)
        return
      }

      latestStore.setRunPhase('idle')
      latestStore.resetPostRunJobs()
      latestStore.setLastRunOutcome(outcome)
    }

    const hasPendingBlockingPostRunJobs = (targetChatUuid?: string | null): boolean => {
      const latestStore = useChatStore.getState()
      const status = targetChatUuid
        ? latestStore.getRunStatusForChat(targetChatUuid)
        : latestStore
      return status.postRunJobs.compression === 'pending'
    }

    const bindBackgroundTitleEvents = (submissionId: string): void => {
      if (backgroundTitleUnsubscribers.has(submissionId)) return

      const unsubscribe = subscribeRunEvents((event: RunEvent) => {
        if (event.submissionId !== submissionId) return
        if (event.type === CHAT_HOST_EVENTS.CHAT_UPDATED) {
          useChatStore.getState().updateChatList(event.payload.chatEntity)
          return
        }
        if (
          event.type === RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED
          || event.type === RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED
        ) {
          backgroundTitleUnsubscribers.get(submissionId)?.()
          backgroundTitleUnsubscribers.delete(submissionId)
        }
      })
      backgroundTitleUnsubscribers.set(submissionId, unsubscribe)
    }

    const cleanupActiveRun = (submissionId: string, targetChatUuid?: string | null): void => {
      const binding = activeBindings.get(submissionId)
      if (!binding || (targetChatUuid && binding.chatUuid !== targetChatUuid)) return
      activeBindings.delete(submissionId)
      binding.unsubscribe?.()
      useChatStore.getState().clearToolLiveOutputs(submissionId)
    }

    const maybeCleanupAfterBackgroundJobs = (
      submissionId: string,
      targetChatUuid?: string | null
    ): void => {
      const binding = activeBindings.get(submissionId)
      if (!binding || !binding.runCompletedRef.current) return
      if (hasPendingBlockingPostRunJobs(targetChatUuid)) return

      const latestStore = useChatStore.getState()
      const status = targetChatUuid
        ? latestStore.getRunStatusForChat(targetChatUuid)
        : latestStore
      if (status.postRunJobs.title === 'pending') {
        bindBackgroundTitleEvents(submissionId)
      }
      resetRunLifecycle('completed', targetChatUuid)
      cleanupActiveRun(submissionId, targetChatUuid)
    }

    const bindScheduleRun = (event: Extract<ScheduleEvent, { type: typeof SCHEDULE_EVENTS.STARTED }>): void => {
      const { task, run, submissionId, executionChat } = event.payload
      if (!submissionId || activeBindings.has(submissionId)) return

      const executionChatUuid = resolveExecutionChatUuid(task, run, executionChat)
      if (executionChat) {
        useChatStore.getState().applyReadyChat(executionChat, { selectShell: false })
      }
      useChatStore.getState().setRunPhaseForChat(executionChatUuid, 'submitting')

      const runChatUuidRef = { current: executionChatUuid }
      const runCompletedRef = { current: false }
      const lastErrorMessageRef = { current: null as LastRunErrorMessage | null }
      const clearedErrorMessageIdsRef = { current: new Set<number>() }
      const binding: ScheduleRunBinding = {
        chatUuid: executionChatUuid,
        runCompletedRef,
        unsubscribe: null
      }

      const input: BindChatRunEventsInput = {
        submissionId,
        runChatUuidRef,
        chatStore: useChatStore.getState(),
        runCompletedRef,
        lastErrorMessageRef,
        clearedErrorMessageIdsRef,
        hasPendingBlockingPostRunJobs: targetChatUuid => hasPendingBlockingPostRunJobs(targetChatUuid),
        maybeCleanupAfterBackgroundJobs: targetChatUuid => maybeCleanupAfterBackgroundJobs(submissionId, targetChatUuid),
        resetRunLifecycle: (outcome, targetChatUuid) => resetRunLifecycle(outcome, targetChatUuid),
        cleanupActiveRun: targetChatUuid => cleanupActiveRun(submissionId, targetChatUuid)
      }

      activeBindings.set(submissionId, binding)
      binding.unsubscribe = bindChatRunEvents(input)
    }

    const unsubscribe = subscribeScheduleEvents((event: ScheduleEvent) => {
      if (event.type === SCHEDULE_EVENTS.STARTED) {
        bindScheduleRun(event)
        return
      }

      if (event.type === SCHEDULE_EVENTS.MESSAGE_CREATED || event.type === SCHEDULE_EVENTS.MESSAGE_UPDATED) {
        const message = event.payload?.message
        const targetChatUuid = message?.chatUuid ?? event.chatUuid
        if (message && targetChatUuid) {
          useChatStore.getState().upsertMessageForChat(targetChatUuid, message)
        }
        return
      }

      if (event.type === SCHEDULE_EVENTS.RUN_FINISHED) {
        const { task, run } = event.payload
        const targetChatUuid = run.execution_chat_uuid ?? event.chatUuid ?? task.chat_uuid
        const binding = run.submission_id
          ? activeBindings.get(run.submission_id)
          : Array.from(activeBindings.values()).find(item => item.chatUuid === targetChatUuid)
        const outcome = runOutcome(run.status)
        if (binding && outcome) {
          const submissionId = Array.from(activeBindings.entries()).find(([, item]) => item === binding)?.[0]
          if (submissionId) {
            if (outcome === 'completed') {
              binding.runCompletedRef.current = true
              maybeCleanupAfterBackgroundJobs(submissionId, targetChatUuid)
            } else {
              resetRunLifecycle(outcome, targetChatUuid)
              cleanupActiveRun(submissionId, targetChatUuid)
            }
          }
        }

        const currentChatUuid = useChatStore.getState().currentChatUuid
        if (currentChatUuid === targetChatUuid || (!currentChatUuid && chatUuidRef.current === targetChatUuid)) return
        if (run.status === 'completed') {
          toast.success('任务已完成', { description: task.goal })
        } else if (run.status === 'failed') {
          toast.error('任务执行失败', { description: run.last_error || task.goal })
        }
        return
      }

      if (event.type !== SCHEDULE_EVENTS.UPDATED) return
    })

    return (): void => {
      unsubscribe()
      for (const binding of activeBindings.values()) binding.unsubscribe?.()
      activeBindings.clear()
      for (const unsubscribeTitle of backgroundTitleUnsubscribers.values()) unsubscribeTitle()
      backgroundTitleUnsubscribers.clear()
    }
  }, [])
}
