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
const PENDING_CHAT_RUN_KEY = '__pending_chat__'

export type ChatRunSubmitOptions = {
  tools?: any[]
  userInstruction?: string
  stream?: boolean
  options?: IUnifiedRequest['options']
}

type RunPhaseBeforeCancel = 'submitting' | 'streaming' | 'post_run'

type ActiveRunHandle = {
  submissionId: string
  runChatUuidRef: { current: string | null }
  abortController: AbortController
  unsubscribe: (() => void) | null
  runCompletedRef: { current: boolean }
  lastErrorMessageRef: { current: LastRunErrorMessage | null }
  clearedErrorMessageIdsRef: { current: Set<number> }
  preCancelRunPhase: RunPhaseBeforeCancel | null
  abortFallbackTimer: ReturnType<typeof setTimeout> | null
}

export default function useChatRun() {
  const chatStore = useChatStore()

  const activeRunsRef = useRef<Map<string, ActiveRunHandle>>(new Map())
  const backgroundTitleUnsubscribersRef = useRef<Map<string, () => void>>(new Map())

  const getRunKey = (chatUuid: string | null | undefined): string => chatUuid ?? PENDING_CHAT_RUN_KEY

  const findActiveRunForChat = (chatUuid: string | null | undefined): ActiveRunHandle | null => {
    const key = getRunKey(chatUuid)
    for (const handle of activeRunsRef.current.values()) {
      if (getRunKey(handle.runChatUuidRef.current) === key) {
        return handle
      }
    }

    return null
  }

  const resetRunLifecycle = (
    outcome: 'idle' | 'completed' | 'failed' | 'aborted' = 'idle',
    chatUuid?: string | null
  ) => {
    const latestStore = useChatStore.getState()
    if (chatUuid) {
      latestStore.setRunPhaseForChat(chatUuid, 'idle')
      latestStore.resetPostRunJobsForChat(chatUuid)
      latestStore.setLastRunOutcomeForChat(chatUuid, outcome)
      return
    }

    latestStore.setRunPhase('idle')
    latestStore.resetPostRunJobs()
    latestStore.setLastRunOutcome(outcome)
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

  const cleanupRunHandle = (
    handle: ActiveRunHandle,
    options: { followPendingTitle?: boolean } = {}
  ) => {
    const shouldFollowPendingTitle = options.followPendingTitle

    if (shouldFollowPendingTitle) {
      bindBackgroundTitleEvents(handle.submissionId)
    }

    if (handle.abortFallbackTimer) {
      clearTimeout(handle.abortFallbackTimer)
      handle.abortFallbackTimer = null
    }
    handle.unsubscribe?.()
    handle.unsubscribe = null
    handle.runCompletedRef.current = false
    handle.preCancelRunPhase = null
    activeRunsRef.current.delete(handle.submissionId)
  }

  const hasPendingBlockingPostRunJobs = (chatUuid?: string | null) => {
    const latestStore = useChatStore.getState()
    const { postRunJobs } = chatUuid
      ? latestStore.getRunStatusForChat(chatUuid)
      : latestStore
    return postRunJobs.compression === 'pending'
  }

  const maybeCleanupAfterBackgroundJobs = (chatUuid?: string | null) => {
    const handle = findActiveRunForChat(chatUuid)
    if (!handle || !handle.runCompletedRef.current) {
      return
    }
    if (hasPendingBlockingPostRunJobs(chatUuid)) {
      return
    }
    const latestStore = useChatStore.getState()
    const runStatus = chatUuid ? latestStore.getRunStatusForChat(chatUuid) : latestStore
    const followPendingTitle = runStatus.postRunJobs.title === 'pending'
    resetRunLifecycle('completed', chatUuid)
    cleanupRunHandle(handle, { followPendingTitle })
  }

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: ChatRunSubmitOptions
  ): Promise<void> => {
    if (findActiveRunForChat(useChatStore.getState().currentChatUuid)) {
      return
    }

    const state = useChatStore.getState()
    const modelRef = state.selectedModelRef ?? state.ensureSelectedModelRef()
    if (!modelRef) {
      return
    }

    const submissionId = uuidv4()
    const controller = new AbortController()
    const runChatUuidRef = { current: state.currentChatUuid ?? null }
    const runCompletedRef = { current: false }
    const lastErrorMessageRef = { current: null as LastRunErrorMessage | null }
    const clearedErrorMessageIdsRef = { current: new Set<number>() }
    const handle: ActiveRunHandle = {
      submissionId,
      runChatUuidRef,
      abortController: controller,
      unsubscribe: null,
      runCompletedRef,
      lastErrorMessageRef,
      clearedErrorMessageIdsRef,
      preCancelRunPhase: null,
      abortFallbackTimer: null
    }
    controller.signal.addEventListener('abort', () => {
      void invokeRunCancel({ submissionId, reason: 'abort' })
    })
    const cleanupActiveRun = () => {
      cleanupRunHandle(handle)
    }

    activeRunsRef.current.set(submissionId, handle)
    handle.unsubscribe = bindChatRunEvents({
      submissionId,
      runChatUuidRef,
      chatStore,
      runCompletedRef,
      lastErrorMessageRef,
      clearedErrorMessageIdsRef,
      hasPendingBlockingPostRunJobs,
      maybeCleanupAfterBackgroundJobs,
      resetRunLifecycle,
      cleanupActiveRun
    })

    if (textCtx.trim()) {
      chatStore.setPendingUserMessage({
        submissionId,
        chatUuid: state.currentChatUuid ?? null,
        text: textCtx,
        mediaCtx,
        createdAt: Date.now()
      })
    }
    chatStore.resetPostRunJobs()
    chatStore.setLastRunOutcome('idle')
    if (state.currentChatUuid) {
      chatStore.resetPostRunJobsForChat(state.currentChatUuid)
      chatStore.setLastRunOutcomeForChat(state.currentChatUuid, 'idle')
      chatStore.setRunPhaseForChat(state.currentChatUuid, 'submitting')
    } else {
      chatStore.setRunPhase('submitting')
    }

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
          chatUserInstruction: state.userInstruction,
          permissionApprovalMode: state.permissionApprovalMode
        },
        modelRef,
        chatId: state.currentChatId ?? undefined,
        chatUuid: state.currentChatUuid ?? undefined
      })
    } catch (error) {
      chatStore.clearPendingUserMessage(submissionId)
      resetRunLifecycle('idle', runChatUuidRef.current)
      cleanupRunHandle(handle)
      throw error
    }
  }

  const cancel = () => {
    const currentChatUuid = useChatStore.getState().currentChatUuid
    const handle = findActiveRunForChat(currentChatUuid)
    if (!handle) {
      resetRunLifecycle('idle', currentChatUuid)
      return
    }

    const latestStore = useChatStore.getState()
    const runStatus = currentChatUuid ? latestStore.getRunStatusForChat(currentChatUuid) : latestStore
    if (runStatus.runPhase === 'cancelling') {
      return
    }

    const currentPhase = runStatus.runPhase
    handle.preCancelRunPhase =
      currentPhase === 'submitting' || currentPhase === 'streaming' || currentPhase === 'post_run'
        ? currentPhase
        : null

    if (!handle.abortController.signal.aborted) {
      handle.abortController.abort()
    } else {
      void invokeRunCancel({ submissionId: handle.submissionId, reason: 'user_cancelled' })
    }
    if (currentChatUuid) {
      chatStore.setRunPhaseForChat(currentChatUuid, 'cancelling')
    } else {
      chatStore.setRunPhase('cancelling')
    }
    if (handle.abortFallbackTimer) {
      clearTimeout(handle.abortFallbackTimer)
    }
    handle.abortFallbackTimer = setTimeout(() => {
      handle.abortFallbackTimer = null
      const fallbackPhase = handle.preCancelRunPhase
      const latestStatus = currentChatUuid
        ? useChatStore.getState().getRunStatusForChat(currentChatUuid)
        : useChatStore.getState()
      if (fallbackPhase && latestStatus.runPhase === 'cancelling') {
        if (currentChatUuid) {
          chatStore.setRunPhaseForChat(currentChatUuid, fallbackPhase)
        } else {
          chatStore.setRunPhase(fallbackPhase)
        }
      }
      toast.warning('Cancellation is taking longer than expected')
    }, ABORT_FALLBACK_TIMEOUT_MS)
  }

  return { onSubmit, cancel }
}
