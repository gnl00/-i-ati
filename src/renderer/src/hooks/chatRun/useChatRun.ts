import { useChatStore } from '@renderer/store/chatStore'
import { invokeRunCancel, invokeRunStart, subscribeRunEvents } from '@renderer/invoker/ipcInvoker'
import { v4 as uuidv4 } from 'uuid'
import { useRef } from 'react'
import { toast } from 'sonner'
import { bindChatRunEvents } from './chatRunEvent'
import { collectRunTools } from './collectRunTools'
import type { LastRunErrorMessage } from './reconcileRunErrorMessage'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import type { RunEvent } from '@shared/run/events'

const ABORT_FALLBACK_TIMEOUT_MS = 3000

export type ChatRunSubmitOptions = {
  tools?: any[]
  userInstruction?: string
  stream?: boolean
  options?: IUnifiedRequest['options']
}

export default function useChatRun() {
  const chatStore = useChatStore()

  const activeSubmissionIdRef = useRef<string | null>(null)
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const lastErrorMessageRef = useRef<LastRunErrorMessage | null>(null)
  const clearedErrorMessageIdsRef = useRef<Set<number>>(new Set())
  const runCompletedRef = useRef(false)
  const preCancelRunPhaseRef = useRef<'submitting' | 'streaming' | 'post_run' | null>(null)
  const abortFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backgroundTitleUnsubscribersRef = useRef<Map<string, () => void>>(new Map())

  const resetRunLifecycle = (outcome: 'idle' | 'completed' | 'failed' | 'aborted' = 'idle') => {
    chatStore.setRunPhase('idle')
    chatStore.resetPostRunJobs()
    chatStore.setLastRunOutcome(outcome)
  }

  const bindBackgroundTitleEvents = (submissionId: string) => {
    if (backgroundTitleUnsubscribersRef.current.has(submissionId)) {
      return
    }

    const unsubscribe = subscribeRunEvents((event: RunEvent) => {
      if (event.submissionId !== submissionId) {
        return
      }

      if (event.type === CHAT_HOST_EVENTS.CHAT_UPDATED) {
        useChatStore.getState().updateChatList(event.payload.chatEntity)
        return
      }

      if (
        event.type === RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED
        || event.type === RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED
      ) {
        const cleanup = backgroundTitleUnsubscribersRef.current.get(submissionId)
        cleanup?.()
        backgroundTitleUnsubscribersRef.current.delete(submissionId)
      }
    })

    backgroundTitleUnsubscribersRef.current.set(submissionId, unsubscribe)
  }

  const cleanupActiveRun = (options: { followPendingTitle?: boolean } = {}) => {
    const submissionId = activeSubmissionIdRef.current
    const shouldFollowPendingTitle = options.followPendingTitle
      && submissionId

    if (shouldFollowPendingTitle && submissionId) {
      bindBackgroundTitleEvents(submissionId)
    }

    if (abortFallbackTimerRef.current) {
      clearTimeout(abortFallbackTimerRef.current)
      abortFallbackTimerRef.current = null
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    activeSubmissionIdRef.current = null
    activeAbortControllerRef.current = null
    runCompletedRef.current = false
    preCancelRunPhaseRef.current = null
  }

  const hasPendingBlockingPostRunJobs = () => {
    const { postRunJobs } = useChatStore.getState()
    return postRunJobs.compression === 'pending'
  }

  const maybeCleanupAfterBackgroundJobs = () => {
    if (!runCompletedRef.current) {
      return
    }
    if (hasPendingBlockingPostRunJobs()) {
      return
    }
    const followPendingTitle = useChatStore.getState().postRunJobs.title === 'pending'
    resetRunLifecycle('completed')
    cleanupActiveRun({ followPendingTitle })
  }

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: ChatRunSubmitOptions
  ): Promise<void> => {
    if (activeSubmissionIdRef.current) {
      return
    }

    const state = useChatStore.getState()
    const modelRef = state.selectedModelRef ?? state.ensureSelectedModelRef()
    if (!modelRef) {
      return
    }

    const submissionId = uuidv4()
    const controller = new AbortController()
    controller.signal.addEventListener('abort', () => {
      void invokeRunCancel({ submissionId, reason: 'abort' })
    })

    activeSubmissionIdRef.current = submissionId
    activeAbortControllerRef.current = controller
    unsubscribeRef.current = bindChatRunEvents({
      submissionId,
      chatStore,
      runCompletedRef,
      lastErrorMessageRef,
      clearedErrorMessageIdsRef,
      hasPendingBlockingPostRunJobs,
      maybeCleanupAfterBackgroundJobs,
      resetRunLifecycle,
      cleanupActiveRun
    })

    chatStore.resetPostRunJobs()
    chatStore.setLastRunOutcome('idle')
    chatStore.setRunPhase('submitting')

    try {
      await invokeRunStart({
        submissionId,
        input: {
          textCtx,
          mediaCtx,
          tools: collectRunTools(state, options),
          userInstruction: options.userInstruction,
          options: options.options,
          stream: options.stream,
          chatUserInstruction: state.userInstruction
        },
        modelRef,
        chatId: state.currentChatId ?? undefined,
        chatUuid: state.currentChatUuid ?? undefined
      })
    } catch (error) {
      resetRunLifecycle()
      cleanupActiveRun()
      throw error
    }
  }

  const cancel = () => {
    const submissionId = activeSubmissionIdRef.current
    if (!submissionId) {
      resetRunLifecycle()
      return
    }

    if (useChatStore.getState().runPhase === 'cancelling') {
      return
    }

    const currentPhase = useChatStore.getState().runPhase
    preCancelRunPhaseRef.current =
      currentPhase === 'submitting' || currentPhase === 'streaming' || currentPhase === 'post_run'
        ? currentPhase
        : null

    if (activeAbortControllerRef.current && !activeAbortControllerRef.current.signal.aborted) {
      activeAbortControllerRef.current.abort()
    } else {
      void invokeRunCancel({ submissionId, reason: 'user_cancelled' })
    }
    chatStore.setRunPhase('cancelling')
    if (abortFallbackTimerRef.current) {
      clearTimeout(abortFallbackTimerRef.current)
    }
    abortFallbackTimerRef.current = setTimeout(() => {
      abortFallbackTimerRef.current = null
      const fallbackPhase = preCancelRunPhaseRef.current
      if (fallbackPhase && useChatStore.getState().runPhase === 'cancelling') {
        chatStore.setRunPhase(fallbackPhase)
      }
      toast.warning('Cancellation is taking longer than expected')
    }, ABORT_FALLBACK_TIMEOUT_MS)
  }

  return { onSubmit, cancel }
}
