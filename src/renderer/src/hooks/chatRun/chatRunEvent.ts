import { subscribeRunEvents } from '@renderer/invoker/ipcInvoker'
import { useChatStore } from '@renderer/store/chatStore'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { RUN_EVENTS, type RunEvent } from '@shared/run/events'
import type { MutableRefObject } from 'react'
import { toast } from 'sonner'
import {
  clearPreviousErrorMessage,
  getRunFailureDescription,
  normalizeRunError,
  type LastRunErrorMessage
} from './reconcileRunErrorMessage'

type ChatStoreState = ReturnType<typeof useChatStore.getState>

type ChatRunLifecycleOutcome = 'idle' | 'completed' | 'failed' | 'aborted'

type BindChatRunEventsInput = {
  submissionId: string
  chatStore: ChatStoreState
  runCompletedRef: MutableRefObject<boolean>
  lastErrorMessageRef: MutableRefObject<LastRunErrorMessage | null>
  clearedErrorMessageIdsRef: MutableRefObject<Set<number>>
  hasPendingPostRunJobs: () => boolean
  maybeCleanupAfterBackgroundJobs: () => void
  resetRunLifecycle: (outcome?: ChatRunLifecycleOutcome) => void
  cleanupActiveRun: () => void
}

const getLatestChatStore = (): ChatStoreState => useChatStore.getState()

function handleChatReady(chatStore: ChatStoreState, event: Extract<RunEvent, { type: typeof CHAT_HOST_EVENTS.CHAT_READY }>): void {
  chatStore.applyReadyChat(event.payload.chatEntity)
}

function handleMessagesLoaded(chatStore: ChatStoreState, event: Extract<RunEvent, { type: typeof CHAT_HOST_EVENTS.MESSAGES_LOADED }>): void {
  chatStore.resetPreview()
  chatStore.setMessages(event.payload.messages)
  if (event.payload.messages.length > 0) {
    const latestStore = getLatestChatStore()
    chatStore.setScrollHint({
      type: 'conversation-switch',
      chatUuid: latestStore.currentChatUuid,
      index: event.payload.messages.length - 1,
      align: 'end'
    })
  } else {
    chatStore.clearScrollHint()
  }
}

function handleRunMessageEvent(
  chatStore: ChatStoreState,
  event: Extract<RunEvent, { type: typeof RUN_EVENTS.MESSAGE_CREATED | typeof RUN_EVENTS.MESSAGE_UPDATED }>,
  clearedErrorMessageIdsRef: MutableRefObject<Set<number>>
): void {
  const { message } = event.payload
  const latestStore = getLatestChatStore()

  if (message.body.role === 'assistant' && latestStore.runPhase === 'submitting') {
    chatStore.setRunPhase('streaming')
  }
  if (message.id && clearedErrorMessageIdsRef.current.has(message.id)) {
    return
  }

  latestStore.upsertMessage(message)

  if (event.type === RUN_EVENTS.MESSAGE_CREATED && message.body.role === 'user') {
    latestStore.setScrollHint({
      type: 'user-sent',
      chatUuid: latestStore.currentChatUuid,
      messageId: message.id
    })
  }

  if (message.body.role === 'assistant') {
    chatStore.resetPreview()
  }
}

function handleMaintenancePending(
  chatStore: ChatStoreState,
  job: 'title' | 'compression',
  runCompletedRef: MutableRefObject<boolean>
): void {
  chatStore.setPostRunJobState(job, 'pending')
  if (runCompletedRef.current) {
    chatStore.setRunPhase('post_run')
  }
}

function handleMaintenanceCompleted(
  chatStore: ChatStoreState,
  job: 'title' | 'compression',
  maybeCleanupAfterBackgroundJobs: () => void
): void {
  chatStore.setPostRunJobState(job, 'idle')
  maybeCleanupAfterBackgroundJobs()
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
    hasPendingPostRunJobs,
    maybeCleanupAfterBackgroundJobs,
    resetRunLifecycle,
    cleanupActiveRun
  } = input

  if (event.submissionId !== submissionId) {
    return
  }

  switch (event.type) {
    case CHAT_HOST_EVENTS.CHAT_READY:
      handleChatReady(chatStore, event)
      return
    case CHAT_HOST_EVENTS.MESSAGES_LOADED:
      handleMessagesLoaded(chatStore, event)
      return
    case RUN_EVENTS.MESSAGE_CREATED:
    case RUN_EVENTS.MESSAGE_UPDATED:
      handleRunMessageEvent(chatStore, event, clearedErrorMessageIdsRef)
      return
    case RUN_EVENTS.MESSAGE_SEGMENT_UPDATED:
      getLatestChatStore().patchMessageSegment(event.payload.messageId, event.payload.patch)
      return
    case RUN_EVENTS.PREVIEW_UPDATED:
      chatStore.replacePreviewMessage(event.payload.message)
      return
    case RUN_EVENTS.PREVIEW_SEGMENT_UPDATED:
      chatStore.applyPreviewSegmentPatch(event.payload.patch)
      return
    case RUN_EVENTS.PREVIEW_CLEARED:
      chatStore.resetPreview()
      return
    case CHAT_HOST_EVENTS.CHAT_UPDATED:
      chatStore.updateChatList(event.payload.chatEntity)
      return
    case RUN_EVENTS.TITLE_GENERATION_STARTED:
      handleMaintenancePending(chatStore, 'title', runCompletedRef)
      return
    case RUN_EVENTS.TITLE_GENERATION_COMPLETED:
      handleMaintenanceCompleted(chatStore, 'title', maybeCleanupAfterBackgroundJobs)
      return
    case RUN_EVENTS.TITLE_GENERATION_FAILED:
      chatStore.setPostRunJobState('title', 'failed')
      toast.warning('Title generation failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs()
      return
    case RUN_EVENTS.COMPRESSION_STARTED:
      handleMaintenancePending(chatStore, 'compression', runCompletedRef)
      return
    case RUN_EVENTS.COMPRESSION_COMPLETED:
      handleMaintenanceCompleted(chatStore, 'compression', maybeCleanupAfterBackgroundJobs)
      return
    case RUN_EVENTS.COMPRESSION_FAILED:
      chatStore.setPostRunJobState('compression', 'failed')
      toast.warning('Message compression failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs()
      return
    case RUN_EVENTS.POSTRUN_PLAN: {
      const { title, compression } = event.payload
      chatStore.setPostRunJobState('title', title === 'pending' ? 'pending' : 'idle')
      chatStore.setPostRunJobState('compression', compression === 'pending' ? 'pending' : 'idle')

      if (runCompletedRef.current) {
        if (title === 'pending' || compression === 'pending') {
          chatStore.setRunPhase('post_run')
        } else {
          maybeCleanupAfterBackgroundJobs()
        }
      }
      return
    }
    case RUN_EVENTS.RUN_COMPLETED:
      void clearPreviousErrorMessage({
        lastErrorMessage: lastErrorMessageRef.current,
        clearedErrorMessageIds: clearedErrorMessageIdsRef.current
      }).then(nextLastErrorMessage => {
        lastErrorMessageRef.current = nextLastErrorMessage
      })
      runCompletedRef.current = true
      chatStore.resetPreview()
      chatStore.setLastRunOutcome('completed')
      if (hasPendingPostRunJobs()) {
        chatStore.setRunPhase('post_run')
      } else {
        maybeCleanupAfterBackgroundJobs()
      }
      return
    case RUN_EVENTS.RUN_FAILED: {
      chatStore.resetPreview()
      chatStore.setLastRunOutcome('failed')
      const error = normalizeRunError(event.payload.error)
      const latestStore = getLatestChatStore()
      const errorMessageId = await latestStore.updateLastAssistantMessageWithError(error)
      if (errorMessageId) {
        lastErrorMessageRef.current = {
          id: errorMessageId,
          chatUuid: getLatestChatStore().currentChatUuid
        }
      }
      resetRunLifecycle('failed')
      cleanupActiveRun()
      return
    }
    case RUN_EVENTS.RUN_ABORTED:
      chatStore.resetPreview()
      chatStore.setLastRunOutcome('aborted')
      await getLatestChatStore().settleLatestAssistantAfterAbort()
      resetRunLifecycle('aborted')
      cleanupActiveRun()
      return
    default:
      return
  }
}

export function bindChatRunEvents(input: BindChatRunEventsInput): () => void {
  return subscribeRunEvents((event: RunEvent) => {
    void handleChatRunEvent(input, event)
  })
}
