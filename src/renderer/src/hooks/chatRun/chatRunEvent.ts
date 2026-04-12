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

export function bindChatRunEvents(input: BindChatRunEventsInput): () => void {
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

  return subscribeRunEvents((event: RunEvent) => {
    if (event.submissionId !== submissionId) {
      return
    }

    if (event.type === CHAT_HOST_EVENTS.CHAT_READY) {
      const { chatEntity } = event.payload
      chatStore.updateChatList(chatEntity)
      chatStore.setCurrentChat(chatEntity.id || null, chatEntity.uuid || null)
      chatStore.setChatId(chatEntity.id || null)
      chatStore.setChatUuid(chatEntity.uuid || null)
      chatStore.setChatTitle(chatEntity.title || 'NewChat')
      chatStore.setUserInstruction(chatEntity.userInstruction || '')
      return
    }

    if (event.type === CHAT_HOST_EVENTS.MESSAGES_LOADED) {
      chatStore.clearStreamPreviewMessage()
      chatStore.setMessages(event.payload.messages)
      if (event.payload.messages.length > 0) {
        const state = useChatStore.getState()
        chatStore.setScrollHint({
          type: 'conversation-switch',
          chatUuid: state.currentChatUuid,
          index: event.payload.messages.length - 1,
          align: 'end'
        })
      } else {
        chatStore.clearScrollHint()
      }
      return
    }

    if (
      event.type === RUN_EVENTS.MESSAGE_CREATED
      || event.type === RUN_EVENTS.MESSAGE_UPDATED
    ) {
      const { message } = event.payload
      if (message.body.role === 'assistant' && useChatStore.getState().runPhase === 'submitting') {
        chatStore.setRunPhase('streaming')
      }
      if (message.id && clearedErrorMessageIdsRef.current.has(message.id)) {
        return
      }
      useChatStore.getState().upsertMessage(message)
      if (event.type === RUN_EVENTS.MESSAGE_CREATED && message.body.role === 'user') {
        useChatStore.getState().setScrollHint({
          type: 'user-sent',
          chatUuid: useChatStore.getState().currentChatUuid,
          messageId: message.id
        })
      }
      if (message.body.role === 'assistant') {
        chatStore.clearStreamPreviewMessage()
      }
      return
    }

    if (event.type === RUN_EVENTS.MESSAGE_SEGMENT_UPDATED) {
      useChatStore.getState().patchMessageSegment(event.payload.messageId, event.payload.patch)
      return
    }

    if (event.type === RUN_EVENTS.PREVIEW_UPDATED) {
      chatStore.setStreamPreviewMessage(event.payload.message)
      return
    }

    if (event.type === RUN_EVENTS.PREVIEW_SEGMENT_UPDATED) {
      chatStore.patchStreamPreviewSegment(event.payload.patch)
      return
    }

    if (event.type === RUN_EVENTS.PREVIEW_CLEARED) {
      chatStore.clearStreamPreviewMessage()
      return
    }

    if (event.type === CHAT_HOST_EVENTS.CHAT_UPDATED) {
      chatStore.updateChatList(event.payload.chatEntity)
      if (!chatStore.currentChatUuid || chatStore.currentChatUuid === event.payload.chatEntity.uuid) {
        chatStore.setChatTitle(event.payload.chatEntity.title || 'NewChat')
      }
      return
    }

    if (event.type === RUN_EVENTS.TITLE_GENERATION_STARTED) {
      chatStore.setPostRunJobState('title', 'pending')
      if (runCompletedRef.current) {
        chatStore.setRunPhase('post_run')
      }
      return
    }

    if (event.type === RUN_EVENTS.TITLE_GENERATION_COMPLETED) {
      chatStore.setPostRunJobState('title', 'idle')
      maybeCleanupAfterBackgroundJobs()
      return
    }

    if (event.type === RUN_EVENTS.TITLE_GENERATION_FAILED) {
      chatStore.setPostRunJobState('title', 'failed')
      toast.warning('Title generation failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs()
      return
    }

    if (event.type === RUN_EVENTS.COMPRESSION_STARTED) {
      chatStore.setPostRunJobState('compression', 'pending')
      if (runCompletedRef.current) {
        chatStore.setRunPhase('post_run')
      }
      return
    }

    if (event.type === RUN_EVENTS.COMPRESSION_COMPLETED) {
      chatStore.setPostRunJobState('compression', 'idle')
      maybeCleanupAfterBackgroundJobs()
      return
    }

    if (event.type === RUN_EVENTS.COMPRESSION_FAILED) {
      chatStore.setPostRunJobState('compression', 'failed')
      toast.warning('Message compression failed', {
        description: getRunFailureDescription(event.payload.error)
      })
      maybeCleanupAfterBackgroundJobs()
      return
    }

    if (event.type === RUN_EVENTS.POSTRUN_PLAN) {
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

    if (event.type === RUN_EVENTS.RUN_COMPLETED) {
      void clearPreviousErrorMessage({
        lastErrorMessage: lastErrorMessageRef.current,
        clearedErrorMessageIds: clearedErrorMessageIdsRef.current
      }).then(nextLastErrorMessage => {
        lastErrorMessageRef.current = nextLastErrorMessage
      })
      runCompletedRef.current = true
      chatStore.clearStreamPreviewMessage()
      chatStore.setLastRunOutcome('completed')
      if (hasPendingPostRunJobs()) {
        chatStore.setRunPhase('post_run')
      } else {
        maybeCleanupAfterBackgroundJobs()
      }
      return
    }

    if (event.type === RUN_EVENTS.RUN_FAILED) {
      void (async () => {
        chatStore.clearStreamPreviewMessage()
        chatStore.setLastRunOutcome('failed')
        const error = normalizeRunError(event.payload.error)
        const errorMessageId = await useChatStore.getState().updateLastAssistantMessageWithError(error)
        if (errorMessageId) {
          lastErrorMessageRef.current = {
            id: errorMessageId,
            chatUuid: useChatStore.getState().currentChatUuid
          }
        }
        resetRunLifecycle('failed')
        cleanupActiveRun()
      })()
      return
    }

    if (event.type === RUN_EVENTS.RUN_ABORTED) {
      void (async () => {
        chatStore.clearStreamPreviewMessage()
        chatStore.setLastRunOutcome('aborted')
        await useChatStore.getState().settleLatestAssistantAfterAbort()
        resetRunLifecycle('aborted')
        cleanupActiveRun()
      })()
    }
  })
}
