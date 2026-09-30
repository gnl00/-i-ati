import { subscribeRunEvents } from '@renderer/infrastructure/ipc'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { createRendererLogger } from '@renderer/shared/logging/rendererLogger'
import { scheduleAssistantStreamingPerfRecentSessionFlush } from '@renderer/features/chat/message/typewriter/assistantStreamingPerf'
import { useChatInputQueueStore } from '@renderer/features/chat/input/chatInputQueueStore'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { HIDDEN_MESSAGE_SOURCES } from '@shared/messages/messageSources'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { RunEvent } from '@shared/run/events'
import type { MutableRefObject } from 'react'
import { toast } from 'sonner'
import {
  clearPreviousErrorMessage,
  getRunFailureDescription,
  normalizeRunError,
  type LastRunErrorMessage
} from './reconcileRunErrorMessage'
import { PreviewPatchBatcher } from './previewPatchBatcher'

type ChatStoreState = ReturnType<typeof useChatStore.getState>

type ChatRunLifecycleOutcome = 'idle' | 'completed' | 'failed' | 'aborted'

const logger = createRendererLogger('ChatRunEvent')

export type BindChatRunEventsInput = {
  submissionId: string
  runChatUuidRef: MutableRefObject<string | null>
  chatStore: ChatStoreState
  runCompletedRef: MutableRefObject<boolean>
  lastErrorMessageRef: MutableRefObject<LastRunErrorMessage | null>
  clearedErrorMessageIdsRef: MutableRefObject<Set<number>>
  hasPendingBlockingPostRunJobs: (chatUuid?: string | null) => boolean
  maybeCleanupAfterBackgroundJobs: (chatUuid?: string | null) => void
  resetRunLifecycle: (outcome?: ChatRunLifecycleOutcome, chatUuid?: string | null) => void
  cleanupActiveRun: (chatUuid?: string | null) => void
  previewPatchBatcher?: PreviewPatchBatcher
}

const getLatestChatStore = (): ChatStoreState => useChatStore.getState()

function resolveRunEventChatUuid(input: BindChatRunEventsInput, event: RunEvent): string | null {
  if (event.chatUuid) {
    return event.chatUuid
  }

  switch (event.type) {
    case CHAT_HOST_EVENTS.CHAT_READY:
      return event.payload.chatEntity.uuid ?? input.runChatUuidRef.current
    case CHAT_HOST_EVENTS.MESSAGES_LOADED:
      return event.payload.messages[0]?.chatUuid ?? input.runChatUuidRef.current
    case CHAT_RENDER_EVENTS.MESSAGE_CREATED:
    case CHAT_RENDER_EVENTS.MESSAGE_UPDATED:
      return event.payload.message.chatUuid ?? input.runChatUuidRef.current
    case CHAT_RENDER_EVENTS.PREVIEW_UPDATED:
      return event.payload.message.chatUuid ?? input.runChatUuidRef.current
    case CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED:
      return event.payload.chatUuid ?? input.runChatUuidRef.current
    default:
      return input.runChatUuidRef.current
  }
}

function rememberRunChatUuid(input: BindChatRunEventsInput, chatUuid: string | null): void {
  if (chatUuid) {
    input.runChatUuidRef.current = chatUuid
  }
}

function normalizeUnknownError(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    message: String(error)
  }
}

function getRunEventLogContext(event: RunEvent, error: unknown): Record<string, unknown> {
  const payload = 'payload' in event ? event.payload : undefined
  const patch = payload && typeof payload === 'object' && 'patch' in payload
    ? (payload.patch as MessageSegmentPatch | undefined)
    : undefined
  const segment = patch?.segment

  return {
    error: normalizeUnknownError(error),
    type: event.type,
    submissionId: event.submissionId,
    sequence: event.sequence,
    chatId: event.chatId,
    chatUuid: event.chatUuid,
    segmentId: segment?.segmentId,
    segmentType: segment?.type,
    textLength: segment && (segment.type === 'text' || segment.type === 'reasoning')
      ? segment.content.length
      : undefined
  }
}

function handleChatReady(
  input: BindChatRunEventsInput,
  chatStore: ChatStoreState,
  event: Extract<RunEvent, { type: typeof CHAT_HOST_EVENTS.CHAT_READY }>,
  hadRunChatUuidBeforeEvent: boolean
): void {
  const chatUuid = event.payload.chatEntity.uuid ?? null
  const latestStore = getLatestChatStore()
  const shouldSelectShell = !hadRunChatUuidBeforeEvent || latestStore.currentChatUuid === chatUuid
  chatStore.applyReadyChat(event.payload.chatEntity, { selectShell: shouldSelectShell })
  rememberRunChatUuid(input, chatUuid)
  if (chatUuid) {
    const runStatus = latestStore.getRunStatusForChat(chatUuid)
    if (runStatus.runPhase === 'idle') {
      getLatestChatStore().setRunPhaseForChat(chatUuid, 'submitting')
    }
  }
}

function handleMessagesLoaded(
  chatUuid: string | null,
  chatStore: ChatStoreState,
  event: Extract<RunEvent, { type: typeof CHAT_HOST_EVENTS.MESSAGES_LOADED }>
): void {
  if (chatUuid) {
    chatStore.resetPreviewForChat(chatUuid)
    chatStore.setMessagesForChat(chatUuid, event.payload.messages)
  } else {
    chatStore.resetPreview()
    chatStore.setMessages(event.payload.messages)
  }

  let latestVisibleMessageIndex = -1
  for (let index = event.payload.messages.length - 1; index >= 0; index -= 1) {
    const message = event.payload.messages[index]
    if (!message.body.source || !HIDDEN_MESSAGE_SOURCES.has(message.body.source)) {
      latestVisibleMessageIndex = index
      break
    }
  }
  if (latestVisibleMessageIndex >= 0 && (!chatUuid || getLatestChatStore().currentChatUuid === chatUuid)) {
    const latestStore = getLatestChatStore()
    chatStore.setScrollHint({
      type: 'conversation-switch',
      chatUuid: chatUuid ?? latestStore.currentChatUuid,
      index: latestVisibleMessageIndex,
      align: 'end'
    })
  } else if (!chatUuid || getLatestChatStore().currentChatUuid === chatUuid) {
    chatStore.clearScrollHint()
  }
}

function handleRunMessageEvent(
  chatUuid: string | null,
  chatStore: ChatStoreState,
  event: Extract<RunEvent, { type: typeof CHAT_RENDER_EVENTS.MESSAGE_CREATED | typeof CHAT_RENDER_EVENTS.MESSAGE_UPDATED }>,
  clearedErrorMessageIdsRef: MutableRefObject<Set<number>>
): void {
  const { message } = event.payload
  const latestStore = getLatestChatStore()
  const isVisibleUserMessage = message.body.role === 'user'
    && (!message.body.source || !HIDDEN_MESSAGE_SOURCES.has(message.body.source))

  if (message.body.role === 'assistant') {
    const runStatus = chatUuid ? latestStore.getRunStatusForChat(chatUuid) : latestStore
    if (runStatus.runPhase === 'submitting') {
      if (chatUuid) {
        latestStore.setRunPhaseForChat(chatUuid, 'streaming')
      } else {
        chatStore.setRunPhase('streaming')
      }
    }
  }
  if (message.id && clearedErrorMessageIdsRef.current.has(message.id)) {
    return
  }

  if (chatUuid) {
    latestStore.upsertMessageForChat(chatUuid, message)
  } else {
    latestStore.upsertMessage(message)
  }

  if (
    event.type === CHAT_RENDER_EVENTS.MESSAGE_CREATED
    && isVisibleUserMessage
    && (!chatUuid || latestStore.currentChatUuid === chatUuid)
  ) {
    latestStore.clearPendingUserMessage(event.submissionId)
    latestStore.setScrollHint({
      type: 'user-sent',
      chatUuid: chatUuid ?? latestStore.currentChatUuid,
      messageId: message.id
    })
  }

  if (message.body.role === 'assistant') {
    if (chatUuid) {
      chatStore.resetPreviewForChat(chatUuid)
    } else {
      chatStore.resetPreview()
    }
  }
}

function ensureStreamingPhaseOnPreview(chatUuid: string | null, chatStore: ChatStoreState): void {
  const latestStore = getLatestChatStore()
  const runStatus = chatUuid ? latestStore.getRunStatusForChat(chatUuid) : latestStore
  if (runStatus.runPhase === 'submitting') {
    if (chatUuid) {
      latestStore.setRunPhaseForChat(chatUuid, 'streaming')
    } else {
      chatStore.setRunPhase('streaming')
    }
  }
}

function flushPreviewPatchBatch(input: BindChatRunEventsInput): void {
  input.previewPatchBatcher?.flush('sync')
}

function handleMaintenancePending(
  chatUuid: string | null,
  chatStore: ChatStoreState,
  job: 'title' | 'compression',
  runCompletedRef: MutableRefObject<boolean>,
  blocksSubmit: boolean
): void {
  if (chatUuid) {
    chatStore.setPostRunJobStateForChat(chatUuid, job, 'pending')
  } else {
    chatStore.setPostRunJobState(job, 'pending')
  }
  if (blocksSubmit && runCompletedRef.current) {
    if (chatUuid) {
      chatStore.setRunPhaseForChat(chatUuid, 'post_run')
    } else {
      chatStore.setRunPhase('post_run')
    }
  }
}

function handleMaintenanceCompleted(
  chatUuid: string | null,
  chatStore: ChatStoreState,
  job: 'title' | 'compression',
  maybeCleanupAfterBackgroundJobs: (chatUuid?: string | null) => void
): void {
  if (chatUuid) {
    chatStore.setPostRunJobStateForChat(chatUuid, job, 'idle')
  } else {
    chatStore.setPostRunJobState(job, 'idle')
  }
  maybeCleanupAfterBackgroundJobs(chatUuid)
}

export async function handleChatRunEvent(
  input: BindChatRunEventsInput,
  event: RunEvent
): Promise<void> {
  const {
    submissionId,
    chatStore,
    runCompletedRef,
    lastErrorMessageRef,
    clearedErrorMessageIdsRef,
    hasPendingBlockingPostRunJobs,
    maybeCleanupAfterBackgroundJobs,
    resetRunLifecycle,
    cleanupActiveRun
  } = input

  if (event.submissionId !== submissionId) {
    return
  }

  const hadRunChatUuidBeforeEvent = Boolean(input.runChatUuidRef.current)
  const chatUuid = resolveRunEventChatUuid(input, event)
  rememberRunChatUuid(input, chatUuid)
  useChatInputQueueStore.getState().routeRunEvent(event, chatUuid)

  switch (event.type) {
    case RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED: {
      const state = event.payload.state
      if (state === 'preparing' || state === 'streaming' || state === 'executing_tools' || state === 'finalizing') {
        const phase = state === 'preparing' ? 'submitting' : 'streaming'
        if (chatUuid) getLatestChatStore().setRunPhaseForChat(chatUuid, phase)
        else chatStore.setRunPhase(phase)
      }
      return
    }
    case RUN_TOOL_EVENTS.TOOL_EXECUTION_OUTPUT:
      getLatestChatStore().appendToolLiveOutput(event.payload, event.submissionId, chatUuid)
      return
    case RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED:
    case RUN_TOOL_EVENTS.TOOL_EXECUTION_FAILED:
      getLatestChatStore().clearToolLiveOutput(
        event.payload.toolCallId,
        event.submissionId,
        chatUuid
      )
      return
    case CHAT_HOST_EVENTS.CHAT_READY:
      handleChatReady(input, chatStore, event, hadRunChatUuidBeforeEvent)
      return
    case CHAT_HOST_EVENTS.MESSAGES_LOADED:
      flushPreviewPatchBatch(input)
      handleMessagesLoaded(chatUuid, chatStore, event)
      return
    case CHAT_RENDER_EVENTS.MESSAGE_CREATED:
    case CHAT_RENDER_EVENTS.MESSAGE_UPDATED:
      flushPreviewPatchBatch(input)
      handleRunMessageEvent(chatUuid, chatStore, event, clearedErrorMessageIdsRef)
      return
    case CHAT_RENDER_EVENTS.MESSAGE_SEGMENT_UPDATED:
      if (chatUuid) {
        getLatestChatStore().patchMessageSegmentForChat(chatUuid, event.payload.messageId, event.payload.patch, event.payload.revision)
      } else {
        getLatestChatStore().patchMessageSegment(event.payload.messageId, event.payload.patch, event.payload.revision)
      }
      return
    case CHAT_RENDER_EVENTS.PREVIEW_UPDATED:
      flushPreviewPatchBatch(input)
      ensureStreamingPhaseOnPreview(chatUuid, chatStore)
      if (chatUuid) {
        chatStore.replacePreviewMessageForChat(chatUuid, event.payload.message)
      } else {
        chatStore.replacePreviewMessage(event.payload.message)
      }
      return
    case CHAT_RENDER_EVENTS.PREVIEW_SEGMENT_UPDATED:
      ensureStreamingPhaseOnPreview(chatUuid, chatStore)
      if (input.previewPatchBatcher) {
        input.previewPatchBatcher.enqueue(event.payload.patch)
      } else {
        if (chatUuid) {
          chatStore.applyPreviewSegmentPatchForChat(chatUuid, event.payload.patch)
        } else {
          chatStore.applyPreviewSegmentPatch(event.payload.patch)
        }
      }
      return
    case CHAT_RENDER_EVENTS.PREVIEW_CLEARED:
      flushPreviewPatchBatch(input)
      if (chatUuid) {
        chatStore.resetPreviewForChat(chatUuid)
      } else {
        chatStore.resetPreview()
      }
      return
    case CHAT_HOST_EVENTS.CHAT_UPDATED:
      chatStore.updateChatList(event.payload.chatEntity)
      return
    case RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_STARTED:
      handleMaintenancePending(chatUuid, chatStore, 'title', runCompletedRef, false)
      return
    case RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_COMPLETED:
      handleMaintenanceCompleted(chatUuid, chatStore, 'title', maybeCleanupAfterBackgroundJobs)
      return
    case RUN_MAINTENANCE_EVENTS.TITLE_GENERATION_FAILED:
      if (chatUuid) {
        chatStore.setPostRunJobStateForChat(chatUuid, 'title', 'failed')
      } else {
        chatStore.setPostRunJobState('title', 'failed')
      }
      toast.warning('Title generation failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs(chatUuid)
      return
    case RUN_MAINTENANCE_EVENTS.COMPRESSION_STARTED:
      handleMaintenancePending(chatUuid, chatStore, 'compression', runCompletedRef, true)
      return
    case RUN_MAINTENANCE_EVENTS.COMPRESSION_COMPLETED:
      if (event.payload.result.summaryId && chatUuid) {
        getLatestChatStore().invalidateCompressionSummariesForChat(chatUuid)
      }
      handleMaintenanceCompleted(chatUuid, chatStore, 'compression', maybeCleanupAfterBackgroundJobs)
      return
    case RUN_MAINTENANCE_EVENTS.COMPRESSION_FAILED:
      if (chatUuid) {
        chatStore.setPostRunJobStateForChat(chatUuid, 'compression', 'failed')
      } else {
        chatStore.setPostRunJobState('compression', 'failed')
      }
      toast.warning('Message compression failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs(chatUuid)
      return
    case RUN_MAINTENANCE_EVENTS.POSTRUN_PLAN: {
      const { title, compression } = event.payload
      if (chatUuid) {
        chatStore.setPostRunJobStateForChat(chatUuid, 'title', title === 'pending' ? 'pending' : 'idle')
        chatStore.setPostRunJobStateForChat(chatUuid, 'compression', compression === 'pending' ? 'pending' : 'idle')
      } else {
        chatStore.setPostRunJobState('title', title === 'pending' ? 'pending' : 'idle')
        chatStore.setPostRunJobState('compression', compression === 'pending' ? 'pending' : 'idle')
      }

      if (runCompletedRef.current) {
        if (compression === 'pending') {
          if (chatUuid) {
            chatStore.setRunPhaseForChat(chatUuid, 'post_run')
          } else {
            chatStore.setRunPhase('post_run')
          }
        } else {
          maybeCleanupAfterBackgroundJobs(chatUuid)
        }
      }
      return
    }
    case RUN_LIFECYCLE_EVENTS.RUN_COMPLETED:
      flushPreviewPatchBatch(input)
      getLatestChatStore().clearToolLiveOutputs(event.submissionId)
      input.previewPatchBatcher?.flushPerfSummary('run_completed')
      scheduleAssistantStreamingPerfRecentSessionFlush({
        reason: 'run_completed'
      })
      void clearPreviousErrorMessage({
        lastErrorMessage: lastErrorMessageRef.current,
        clearedErrorMessageIds: clearedErrorMessageIdsRef.current
      }).then(nextLastErrorMessage => {
        lastErrorMessageRef.current = nextLastErrorMessage
      })
      runCompletedRef.current = true
      if (chatUuid) {
        chatStore.resetPreviewForChat(chatUuid)
        chatStore.setLastRunOutcomeForChat(chatUuid, 'completed')
      } else {
        chatStore.resetPreview()
        chatStore.setLastRunOutcome('completed')
      }
      if (hasPendingBlockingPostRunJobs(chatUuid)) {
        if (chatUuid) {
          chatStore.setRunPhaseForChat(chatUuid, 'post_run')
        } else {
          chatStore.setRunPhase('post_run')
        }
      } else {
        maybeCleanupAfterBackgroundJobs(chatUuid)
      }
      return
    case RUN_LIFECYCLE_EVENTS.RUN_FAILED: {
      flushPreviewPatchBatch(input)
      getLatestChatStore().clearToolLiveOutputs(event.submissionId)
      input.previewPatchBatcher?.flushPerfSummary('run_failed')
      scheduleAssistantStreamingPerfRecentSessionFlush({
        reason: 'run_failed'
      })
      if (chatUuid) {
        chatStore.resetPreviewForChat(chatUuid)
        chatStore.setLastRunOutcomeForChat(chatUuid, 'failed')
      } else {
        chatStore.resetPreview()
        chatStore.setLastRunOutcome('failed')
      }
      const error = normalizeRunError(event.payload.error)
      const latestStore = getLatestChatStore()
      latestStore.clearPendingUserMessage(submissionId)
      const errorMessageId = chatUuid
        ? await latestStore.updateLastAssistantMessageWithErrorForChat(chatUuid, error)
        : await latestStore.updateLastAssistantMessageWithError(error)
      if (errorMessageId) {
        lastErrorMessageRef.current = {
          id: errorMessageId,
          chatUuid: chatUuid ?? getLatestChatStore().currentChatUuid
        }
      }
      resetRunLifecycle('failed', chatUuid)
      cleanupActiveRun(chatUuid)
      return
    }
    case RUN_LIFECYCLE_EVENTS.RUN_ABORTED:
      flushPreviewPatchBatch(input)
      getLatestChatStore().clearToolLiveOutputs(event.submissionId)
      input.previewPatchBatcher?.flushPerfSummary('run_aborted')
      scheduleAssistantStreamingPerfRecentSessionFlush({
        reason: 'run_aborted'
      })
      getLatestChatStore().clearPendingUserMessage(submissionId)
      if (chatUuid) {
        chatStore.resetPreviewForChat(chatUuid)
        chatStore.setLastRunOutcomeForChat(chatUuid, 'aborted')
        await getLatestChatStore().settleLatestAssistantAfterAbortForChat(chatUuid)
      } else {
        chatStore.resetPreview()
        chatStore.setLastRunOutcome('aborted')
        await getLatestChatStore().settleLatestAssistantAfterAbort()
      }
      resetRunLifecycle('aborted', chatUuid)
      cleanupActiveRun(chatUuid)
      return
    default:
      return
  }
}

export async function handleChatRunEventSafely(
  input: BindChatRunEventsInput,
  event: RunEvent
): Promise<void> {
  try {
    await handleChatRunEvent(input, event)
  } catch (error) {
    logger.error('chat_run.event_handler_failed', getRunEventLogContext(event, error))
  }
}

type RunBinding = {
  input: BindChatRunEventsInput
  dispose: () => void
  pending?: Promise<void>
}

const runBindings = new Map<string, RunBinding>()
let ingressUsers = 0
let unsubscribeIngress: (() => void) | undefined

function createObservedRun(event: RunEvent): BindChatRunEventsInput {
  const input: BindChatRunEventsInput = {
    submissionId: event.submissionId,
    runChatUuidRef: { current: event.chatUuid ?? null },
    chatStore: useChatStore.getState(),
    runCompletedRef: { current: false },
    lastErrorMessageRef: { current: null },
    clearedErrorMessageIdsRef: { current: new Set() },
    hasPendingBlockingPostRunJobs: chatUuid => Boolean(chatUuid
      && useChatStore.getState().getRunStatusForChat(chatUuid).postRunJobs.compression === 'pending'),
    resetRunLifecycle: (outcome = 'idle', chatUuid) => {
      if (!chatUuid) return
      const store = useChatStore.getState()
      store.setRunPhaseForChat(chatUuid, 'idle')
      store.resetPostRunJobsForChat(chatUuid)
      store.setLastRunOutcomeForChat(chatUuid, outcome)
    },
    cleanupActiveRun: () => runBindings.get(event.submissionId)?.dispose(),
    maybeCleanupAfterBackgroundJobs: chatUuid => {
      if (!input.runCompletedRef.current || input.hasPendingBlockingPostRunJobs(chatUuid)) return
      input.resetRunLifecycle('completed', chatUuid)
      input.cleanupActiveRun(chatUuid)
    }
  }
  return input
}

function ensureRunIngress(): void {
  if (unsubscribeIngress) return
  unsubscribeIngress = subscribeRunEvents(event => {
    // Post-run jobs use their own emitters; metadata does not require a live run binding.
    if (event.type === CHAT_HOST_EVENTS.CHAT_UPDATED) {
      useChatStore.getState().updateChatList(event.payload.chatEntity)
      return
    }
    let binding = runBindings.get(event.submissionId)
    if (!binding) {
      const canObserve = event.chatUuid && (
        (Object.values(CHAT_RENDER_EVENTS) as string[]).includes(event.type) || event.type === CHAT_HOST_EVENTS.CHAT_READY
        || event.type === CHAT_HOST_EVENTS.MESSAGES_LOADED || event.type === RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED
      )
      if (!canObserve) return
      registerRunBinding(createObservedRun(event))
      binding = runBindings.get(event.submissionId)!
    }
    const target = binding
    const deliver = (): Promise<void> => {
      if (runBindings.get(event.submissionId) !== target) return Promise.resolve()
      return handleChatRunEventSafely(target.input, event)
    }
    const pending = target.pending ? target.pending.then(deliver) : deliver()
    target.pending = pending
    void pending.then(() => { if (target.pending === pending) target.pending = undefined })
  })
}

function registerRunBinding(input: BindChatRunEventsInput): () => void {
  runBindings.get(input.submissionId)?.dispose()
  const previewPatchBatcher = new PreviewPatchBatcher({
    applyPatches: patches => {
      const chatUuid = input.runChatUuidRef.current
      if (chatUuid) useChatStore.getState().applyPreviewSegmentPatchesForChat(chatUuid, patches)
      else useChatStore.getState().applyPreviewSegmentPatches(patches)
    }
  })
  const binding: RunBinding = {
    input: { ...input, previewPatchBatcher },
    dispose: () => {
      previewPatchBatcher.flush('sync')
      previewPatchBatcher.cancel()
      if (runBindings.get(input.submissionId) === binding) runBindings.delete(input.submissionId)
      if (ingressUsers === 0 && runBindings.size === 0) {
        unsubscribeIngress?.()
        unsubscribeIngress = undefined
      }
    }
  }
  runBindings.set(input.submissionId, binding)
  return binding.dispose
}

/** App lifetime subscription: every host source uses the same run projection. */
export function retainChatRunIngress(): () => void {
  ingressUsers += 1
  ensureRunIngress()
  return () => {
    ingressUsers -= 1
    if (ingressUsers === 0) {
      for (const binding of [...runBindings.values()]) binding.dispose()
      unsubscribeIngress?.()
      unsubscribeIngress = undefined
    }
  }
}

export function bindChatRunEvents(input: BindChatRunEventsInput): () => void {
  const dispose = registerRunBinding(input)
  ensureRunIngress()
  return dispose
}
