import { subscribeRunEvents } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store/chatStore'
import { createRendererLogger } from '@renderer/services/logging/rendererLogger'
import { scheduleAssistantStreamingPerfRecentSessionFlush } from '@renderer/components/chat/chatMessage/typewriter/assistantStreamingPerf'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import type { MessageSegmentPatch } from '@shared/chat/render-events'
import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_MAINTENANCE_EVENTS } from '@shared/run/maintenance-events'
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

type BindChatRunEventsInput = {
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
  event: Extract<RunEvent, { type: typeof CHAT_HOST_EVENTS.CHAT_READY }>
): void {
  const hadRunChatUuid = Boolean(input.runChatUuidRef.current)
  const chatUuid = event.payload.chatEntity.uuid ?? null
  const latestStore = getLatestChatStore()
  const shouldSelectShell = !hadRunChatUuid || latestStore.currentChatUuid === chatUuid
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

  if (event.payload.messages.length > 0 && (!chatUuid || getLatestChatStore().currentChatUuid === chatUuid)) {
    const latestStore = getLatestChatStore()
    chatStore.setScrollHint({
      type: 'conversation-switch',
      chatUuid: chatUuid ?? latestStore.currentChatUuid,
      index: event.payload.messages.length - 1,
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
    && message.body.role === 'user'
    && (!chatUuid || latestStore.currentChatUuid === chatUuid)
  ) {
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

  const chatUuid = resolveRunEventChatUuid(input, event)
  rememberRunChatUuid(input, chatUuid)

  switch (event.type) {
    case CHAT_HOST_EVENTS.CHAT_READY:
      handleChatReady(input, chatStore, event)
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
        getLatestChatStore().patchMessageSegmentForChat(chatUuid, event.payload.messageId, event.payload.patch)
      } else {
        getLatestChatStore().patchMessageSegment(event.payload.messageId, event.payload.patch)
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
      input.previewPatchBatcher?.flushPerfSummary('run_aborted')
      scheduleAssistantStreamingPerfRecentSessionFlush({
        reason: 'run_aborted'
      })
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

export function bindChatRunEvents(input: BindChatRunEventsInput): () => void {
  const previewPatchBatcher = new PreviewPatchBatcher({
    applyPatches: (patches) => {
      const chatUuid = input.runChatUuidRef.current
      if (chatUuid) {
        useChatStore.getState().applyPreviewSegmentPatchesForChat(chatUuid, patches)
      } else {
        useChatStore.getState().applyPreviewSegmentPatches(patches)
      }
    }
  })
  const boundInput = {
    ...input,
    previewPatchBatcher
  }

  const unsubscribe = subscribeRunEvents((event: RunEvent) => {
    void handleChatRunEventSafely(boundInput, event)
  })

  return () => {
    previewPatchBatcher.flush('sync')
    previewPatchBatcher.cancel()
    unsubscribe()
  }
}
