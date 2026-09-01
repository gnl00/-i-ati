import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { invokeRunCancel, invokeRunStart, invokeRunSteer, subscribeRunEvents } from '@renderer/infrastructure/ipc'
import type { RunSteerImage, RunSteerResult } from '@shared/run/steering-events'
import type { RunCancelRequest, RunCancelResult } from '@shared/run/cancellation'
import { v4 as uuidv4 } from 'uuid'
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
  stream?: boolean
  options?: IUnifiedRequest['options']
}

type RunPhaseBeforeCancel = 'submitting' | 'streaming' | 'post_run'

type ActiveRunHandle = {
  submissionId: string
  runChatUuidRef: { current: string | null }
  unsubscribe: (() => void) | null
  runCompletedRef: { current: boolean }
  lastErrorMessageRef: { current: LastRunErrorMessage | null }
  clearedErrorMessageIdsRef: { current: Set<number> }
  preCancelRunPhase: RunPhaseBeforeCancel | null
  abortFallbackTimer: ReturnType<typeof setTimeout> | null
}

const activeRuns = new Map<string, ActiveRunHandle>()
const backgroundTitleUnsubscribers = new Map<string, () => void>()

const getRunKey = (chatUuid: string | null | undefined): string => (
  chatUuid ?? PENDING_CHAT_RUN_KEY
)

const findActiveRunForChat = (
  chatUuid: string | null | undefined
): ActiveRunHandle | null => {
  const key = getRunKey(chatUuid)
  for (const handle of activeRuns.values()) {
    if (getRunKey(handle.runChatUuidRef.current) === key) {
      return handle
    }
  }

  return null
}

export type ActiveChatRunIdentity = {
  submissionId: string
  chatUuid: string | null
}

export function getActiveChatRunIdentity(
  chatUuid: string | null | undefined
): ActiveChatRunIdentity | null {
  const handle = findActiveRunForChat(chatUuid)
  if (!handle) {
    return null
  }

  return {
    submissionId: handle.submissionId,
    chatUuid: handle.runChatUuidRef.current
  }
}

export const resetChatRunRegistryForTests = (): void => {
  for (const handle of activeRuns.values()) {
    if (handle.abortFallbackTimer) {
      clearTimeout(handle.abortFallbackTimer)
    }
    handle.unsubscribe?.()
  }
  activeRuns.clear()

  for (const unsubscribe of backgroundTitleUnsubscribers.values()) {
    unsubscribe()
  }
  backgroundTitleUnsubscribers.clear()
}

export default function useChatRun() {
  const chatStore = useChatStore()

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
    if (backgroundTitleUnsubscribers.has(submissionId)) {
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
        const cleanup = backgroundTitleUnsubscribers.get(submissionId)
        cleanup?.()
        backgroundTitleUnsubscribers.delete(submissionId)
      }
    })

    backgroundTitleUnsubscribers.set(submissionId, unsubscribe)
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
    useChatStore.getState().clearToolLiveOutputs(handle.submissionId)
    handle.runCompletedRef.current = false
    handle.preCancelRunPhase = null
    activeRuns.delete(handle.submissionId)
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
    const baseModelRef = state.selectedModelRef ?? state.ensureSelectedModelRef()
    if (!baseModelRef) {
      return
    }
    const modelRef = baseModelRef
    const chatModelRef = baseModelRef

    const submissionId = uuidv4()
    const runChatUuidRef = { current: state.currentChatUuid ?? null }
    const runCompletedRef = { current: false }
    const lastErrorMessageRef = { current: null as LastRunErrorMessage | null }
    const clearedErrorMessageIdsRef = { current: new Set<number>() }
    const handle: ActiveRunHandle = {
      submissionId,
      runChatUuidRef,
      unsubscribe: null,
      runCompletedRef,
      lastErrorMessageRef,
      clearedErrorMessageIdsRef,
      preCancelRunPhase: null,
      abortFallbackTimer: null
    }
    const cleanupActiveRun = () => {
      cleanupRunHandle(handle)
    }

    activeRuns.set(submissionId, handle)
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

    const hasPendingUserContent = textCtx.trim().length > 0
      || mediaCtx.some(media => Boolean(media))
    if (hasPendingUserContent) {
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
          options: options.options,
          stream: options.stream,
          chatUserInstruction: state.userInstruction,
          permissionApprovalMode: state.permissionApprovalMode
        },
        modelRef,
        chatModelRef,
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

  const setRunPhase = (
    chatUuid: string | null,
    phase: RunPhaseBeforeCancel | 'idle' | 'cancelling'
  ) => {
    if (chatUuid) {
      useChatStore.getState().setRunPhaseForChat(chatUuid, phase)
    } else {
      useChatStore.getState().setRunPhase(phase)
    }
  }

  const getCancelReasonMessage = (reason: RunCancelResult['reason']): string => {
    switch (reason) {
      case 'chat_mismatch':
        return 'The active run belongs to another chat'
      case 'invalid_request':
        return 'The current run cancellation request is invalid'
      case 'run_not_found':
      default:
        return 'The current run has already finished'
    }
  }

  const scheduleCancelFallback = (
    chatUuid: string | null,
    previousPhase: RunPhaseBeforeCancel | null,
    handle: ActiveRunHandle | null
  ) => {
    if (handle?.abortFallbackTimer) {
      clearTimeout(handle.abortFallbackTimer)
    }

    const timer = setTimeout(() => {
      if (handle) {
        handle.abortFallbackTimer = null
      }
      const latestStatus = chatUuid
        ? useChatStore.getState().getRunStatusForChat(chatUuid)
        : useChatStore.getState()
      if (latestStatus.runPhase === 'cancelling') {
        setRunPhase(chatUuid, previousPhase ?? 'idle')
      }
      toast.warning('Cancellation is taking longer than expected')
    }, ABORT_FALLBACK_TIMEOUT_MS)

    if (handle) {
      handle.abortFallbackTimer = timer
    }
  }

  const settleMissingRun = (
    chatUuid: string | null,
    handle: ActiveRunHandle | null
  ) => {
    if (handle?.abortFallbackTimer) {
      clearTimeout(handle.abortFallbackTimer)
      handle.abortFallbackTimer = null
    }
    setRunPhase(chatUuid, 'idle')
    if (handle) {
      cleanupRunHandle(handle)
    }
  }

  const cancel = async (): Promise<void> => {
    const currentChatUuid = useChatStore.getState().currentChatUuid
    const handle = findActiveRunForChat(currentChatUuid)

    const latestStore = useChatStore.getState()
    const runStatus = currentChatUuid ? latestStore.getRunStatusForChat(currentChatUuid) : latestStore
    if (runStatus.runPhase === 'cancelling') {
      return
    }

    const currentPhase = runStatus.runPhase
    const previousPhase: RunPhaseBeforeCancel | null =
      currentPhase === 'submitting' || currentPhase === 'streaming' || currentPhase === 'post_run'
        ? currentPhase
        : null
    if (handle) {
      handle.preCancelRunPhase = previousPhase
    }

    setRunPhase(currentChatUuid, 'cancelling')

    const request: RunCancelRequest = {
      ...(handle ? { submissionId: handle.submissionId } : {}),
      ...(currentChatUuid ? { chatUuid: currentChatUuid } : {}),
      reason: 'user_cancelled'
    }
    scheduleCancelFallback(currentChatUuid, previousPhase, handle)

    let result: RunCancelResult | undefined
    try {
      result = await invokeRunCancel(request)
    } catch {
      toast.warning('Unable to cancel the current run')
      return
    }

    if (result?.cancelled) {
      return
    }

    if (result?.reason === 'run_not_found') {
      toast.warning(getCancelReasonMessage(result.reason))
      settleMissingRun(currentChatUuid, handle)
      return
    }

    toast.warning(getCancelReasonMessage(result?.reason))
  }

  const steer = async (payload: {
    queueItemId: string
    text: string
    images: ClipbordImg[]
  }): Promise<RunSteerResult> => {
    const images = payload.images.filter((image): image is RunSteerImage => (
      typeof image === 'string' || image === null
    ))
    if (images.length !== payload.images.length) {
      return { accepted: false, reason: 'invalid_request' }
    }

    const currentChatUuid = useChatStore.getState().currentChatUuid
    const handle = findActiveRunForChat(currentChatUuid)
    const chatUuid = handle?.runChatUuidRef.current
    if (!handle || !chatUuid) {
      return { accepted: false, reason: 'run_not_found' }
    }

    return await invokeRunSteer({
      submissionId: handle.submissionId,
      chatUuid,
      queueItemId: payload.queueItemId,
      text: payload.text,
      images
    })
  }

  return { onSubmit, cancel, steer }
}
