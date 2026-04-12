import { useChatStore } from '@renderer/store/chatStore'
import { invokeRunCancel, invokeRunStart } from '@renderer/invoker/ipcInvoker'
import { v4 as uuidv4 } from 'uuid'
import { useRef } from 'react'
import { toast } from 'sonner'
import { bindChatRunEvents } from './chatRunEvent'
import { collectRunTools } from './collectRunTools'
import type { LastRunErrorMessage } from './reconcileRunErrorMessage'

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

  const resetRunLifecycle = (outcome: 'idle' | 'completed' | 'failed' | 'aborted' = 'idle') => {
    chatStore.setRunPhase('idle')
    chatStore.resetPostRunJobs()
    chatStore.setLastRunOutcome(outcome)
  }

  const cleanupActiveRun = () => {
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

  const hasPendingPostRunJobs = () => {
    const { postRunJobs } = useChatStore.getState()
    return postRunJobs.title === 'pending' || postRunJobs.compression === 'pending'
  }

  const maybeCleanupAfterBackgroundJobs = () => {
    if (!runCompletedRef.current) {
      return
    }
    if (hasPendingPostRunJobs()) {
      return
    }
    resetRunLifecycle('completed')
    cleanupActiveRun()
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
      hasPendingPostRunJobs,
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
