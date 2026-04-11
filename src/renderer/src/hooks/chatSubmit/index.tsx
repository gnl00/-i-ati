import { useChatStore } from '@renderer/store/chatStore'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import { v4 as uuidv4 } from 'uuid'
import { useRef } from 'react'
import { invokeChatRunCancel, invokeChatRunStart, subscribeChatRunEvents } from '@renderer/invoker/ipcInvoker'
import { CHAT_RUN_EVENTS, type ChatRunEvent, type SerializedError } from '@shared/chatRun/events'
import toolsDefinitions from '@tools/definitions'
import { toast } from 'sonner'

const ABORT_FALLBACK_TIMEOUT_MS = 3000

function useChatSubmitV2() {
  const chatStore = useChatStore()

  const activeSubmissionIdRef = useRef<string | null>(null)
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const lastErrorMessageRef = useRef<{ id: number; chatUuid: string | null } | null>(null)
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

  const normalizeError = (error: SerializedError | Error): Error => {
    const normalized = new Error(error.message || 'Unknown error')
    normalized.name = error.name || 'Error'
    if (error.stack) {
      normalized.stack = error.stack
    }
    ;(normalized as any).code = (error as any).code
    if (error.cause) {
      ;(normalized as any).cause = error.cause
    }
    return normalized
  }

  const getTitleFailureDescription = (error: SerializedError | Error): string => {
    const normalized = normalizeError(error)
    const firstLine = (normalized.message || 'Unknown error').split('\n')[0].trim()
    if (firstLine.length <= 180) {
      return firstLine
    }
    return `${firstLine.slice(0, 177)}...`
  }

  const clearPreviousErrorMessage = async () => {
    const errorInfo = lastErrorMessageRef.current
    if (!errorInfo) {
      return
    }
    const state = useChatStore.getState()
    if (errorInfo.chatUuid && state.currentChatUuid && errorInfo.chatUuid !== state.currentChatUuid) {
      lastErrorMessageRef.current = null
      return
    }
    const message = state.messages.find(item => item.id === errorInfo.id)
    if (!message || message.body.role !== 'assistant') {
      lastErrorMessageRef.current = null
      return
    }
    const segments = message.body.segments || []
    const hasError = segments.some(seg => (seg as any).type === 'error')
    if (!hasError) {
      lastErrorMessageRef.current = null
      return
    }
    const hasNonErrorSegments = segments.some(seg => (seg as any).type !== 'error')
    const hasContent = typeof message.body.content === 'string'
      ? message.body.content.trim().length > 0
      : Array.isArray(message.body.content) && message.body.content.length > 0

    if (!hasNonErrorSegments && !hasContent) {
      await state.deleteMessage(errorInfo.id)
      clearedErrorMessageIdsRef.current.add(errorInfo.id)
    } else {
      const updated: MessageEntity = {
        ...message,
        body: {
          ...message.body,
          segments: segments.filter(seg => (seg as any).type !== 'error')
        }
      }
      await state.updateMessage(updated)
    }
    lastErrorMessageRef.current = null
  }

  const bindRunEvents = (submissionId: string) => {
    unsubscribeRef.current = subscribeChatRunEvents((event: ChatRunEvent) => {
      if (event.submissionId !== submissionId) {
        return
      }

      if (event.type === CHAT_RUN_EVENTS.CHAT_READY) {
        const { chatEntity } = event.payload
        chatStore.updateChatList(chatEntity)
        chatStore.setCurrentChat(chatEntity.id || null, chatEntity.uuid || null)
        chatStore.setChatId(chatEntity.id || null)
        chatStore.setChatUuid(chatEntity.uuid || null)
        chatStore.setChatTitle(chatEntity.title || 'NewChat')
        chatStore.setUserInstruction(chatEntity.userInstruction || '')
        return
      }

      if (event.type === CHAT_RUN_EVENTS.MESSAGES_LOADED) {
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
        event.type === CHAT_RUN_EVENTS.MESSAGE_CREATED ||
        event.type === CHAT_RUN_EVENTS.MESSAGE_UPDATED
      ) {
        const { message } = event.payload
        if (message.body.role === 'assistant' && useChatStore.getState().runPhase === 'submitting') {
          chatStore.setRunPhase('streaming')
        }
        if (message.id && clearedErrorMessageIdsRef.current.has(message.id)) {
          return
        }
        useChatStore.getState().upsertMessage(message)
        if (event.type === CHAT_RUN_EVENTS.MESSAGE_CREATED && message.body.role === 'user') {
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

      if (event.type === CHAT_RUN_EVENTS.MESSAGE_SEGMENT_UPDATED) {
        useChatStore.getState().patchMessageSegment(event.payload.messageId, event.payload.patch)
        return
      }

      if (event.type === CHAT_RUN_EVENTS.STREAM_PREVIEW_UPDATED) {
        chatStore.setStreamPreviewMessage(event.payload.message)
        return
      }

      if (event.type === CHAT_RUN_EVENTS.STREAM_PREVIEW_SEGMENT_UPDATED) {
        chatStore.patchStreamPreviewSegment(event.payload.patch)
        return
      }

      if (event.type === CHAT_RUN_EVENTS.STREAM_PREVIEW_CLEARED) {
        chatStore.clearStreamPreviewMessage()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.CHAT_UPDATED) {
        chatStore.updateChatList(event.payload.chatEntity)
        if (!chatStore.currentChatUuid || chatStore.currentChatUuid === event.payload.chatEntity.uuid) {
          chatStore.setChatTitle(event.payload.chatEntity.title || 'NewChat')
        }
        return
      }

      if (event.type === CHAT_RUN_EVENTS.TITLE_GENERATE_STARTED) {
        chatStore.setPostRunJobState('title', 'pending')
        if (runCompletedRef.current) {
          chatStore.setRunPhase('post_run')
        }
        return
      }

      if (event.type === CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED) {
        chatStore.setPostRunJobState('title', 'idle')
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED) {
        chatStore.setPostRunJobState('title', 'failed')
        toast.warning('Title generation failed', {
          description: getTitleFailureDescription(event.payload.error)
        })
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.COMPRESSION_STARTED) {
        chatStore.setPostRunJobState('compression', 'pending')
        if (runCompletedRef.current) {
          chatStore.setRunPhase('post_run')
        }
        return
      }

      if (
        event.type === CHAT_RUN_EVENTS.COMPRESSION_COMPLETED
      ) {
        chatStore.setPostRunJobState('compression', 'idle')
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.COMPRESSION_FAILED) {
        chatStore.setPostRunJobState('compression', 'failed')
        toast.warning('Message compression failed', {
          description: getTitleFailureDescription(event.payload.error)
        })
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.POST_RUN_PLAN) {
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

      if (event.type === CHAT_RUN_EVENTS.RUN_COMPLETED) {
        void clearPreviousErrorMessage()
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

      if (event.type === CHAT_RUN_EVENTS.RUN_FAILED) {
        void (async () => {
          chatStore.clearStreamPreviewMessage()
          chatStore.setLastRunOutcome('failed')
          const error = normalizeError(event.payload.error)
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

      if (event.type === CHAT_RUN_EVENTS.RUN_ABORTED) {
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

  const collectTools = (
    state: ReturnType<typeof useChatStore.getState>,
    options: { tools?: any[] }
  ) => {
    const toolsByName = new Map<string, any>()
    const normalizeToolDef = (tool: any): any => tool?.function ?? tool
    const findToolDefinition = (name: string) => {
      const match = (toolsDefinitions as any[]).find(tool => tool?.function?.name === name)
      return match?.function ?? match
    }

    useMcpRuntimeStore.getState().getAllTools().forEach(tool => {
      const normalized = normalizeToolDef(tool)
      const name = normalized?.name
      if (name) {
        toolsByName.set(name, normalized)
      }
    })

    if (state.webSearchEnable) {
      const tool = findToolDefinition('web_search')
      const normalized = normalizeToolDef(tool)
      const name = normalized?.name
      if (name) {
        toolsByName.set(name, normalized)
      }
    }

    options.tools?.forEach(tool => {
      const normalized = normalizeToolDef(tool)
      const name = normalized?.name
      if (name) {
        toolsByName.set(name, normalized)
      }
    })

    return Array.from(toolsByName.values())
  }

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[]; userInstruction?: string; stream?: boolean; options?: IUnifiedRequest['options'] }
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
      void invokeChatRunCancel({ submissionId, reason: 'abort' })
    })

    activeSubmissionIdRef.current = submissionId
    activeAbortControllerRef.current = controller
    bindRunEvents(submissionId)

    chatStore.resetPostRunJobs()
    chatStore.setLastRunOutcome('idle')
    chatStore.setRunPhase('submitting')

    try {
      await invokeChatRunStart({
        submissionId,
        input: {
          textCtx,
          mediaCtx,
          tools: collectTools(state, options),
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
      void invokeChatRunCancel({ submissionId, reason: 'user_cancelled' })
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

export default useChatSubmitV2
