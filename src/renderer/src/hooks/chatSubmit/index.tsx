import { useChatStore } from '@renderer/store'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import { v4 as uuidv4 } from 'uuid'
import { useRef } from 'react'
import { invokeChatRunCancel, invokeChatRunStart, subscribeChatRunEvents } from '@renderer/invoker/ipcInvoker'
import { CHAT_RUN_EVENTS, type ChatRunEvent, type SerializedError } from '@shared/chatRun/events'
import toolsDefinitions from '@tools/definitions'

function useChatSubmitV2() {
  const chatStore = useChatStore()

  const activeSubmissionIdRef = useRef<string | null>(null)
  const activeAbortControllerRef = useRef<AbortController | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const lastErrorMessageRef = useRef<{ id: number; chatUuid: string | null } | null>(null)
  const clearedErrorMessageIdsRef = useRef<Set<number>>(new Set())
  const runCompletedRef = useRef(false)
  const titleJobPendingRef = useRef(false)
  const compressionJobPendingRef = useRef(false)
  const deferredCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetUiState = () => {
    chatStore.setCurrentReqCtrl(undefined)
    chatStore.setReadStreamState(false)
    chatStore.setFetchState(false)
    chatStore.setShowLoadingIndicator(false)
    chatStore.setLastMsgStatus(false)
  }

  const cleanupActiveRun = () => {
    if (deferredCleanupTimerRef.current) {
      clearTimeout(deferredCleanupTimerRef.current)
      deferredCleanupTimerRef.current = null
    }
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    activeSubmissionIdRef.current = null
    activeAbortControllerRef.current = null
    runCompletedRef.current = false
    titleJobPendingRef.current = false
    compressionJobPendingRef.current = false
    chatStore.setCurrentReqCtrl(undefined)
  }

  const maybeCleanupAfterBackgroundJobs = () => {
    if (!runCompletedRef.current) {
      return
    }
    if (titleJobPendingRef.current || compressionJobPendingRef.current) {
      return
    }
    cleanupActiveRun()
  }

  const scheduleDeferredCleanup = () => {
    if (deferredCleanupTimerRef.current) {
      clearTimeout(deferredCleanupTimerRef.current)
    }
    deferredCleanupTimerRef.current = setTimeout(() => {
      deferredCleanupTimerRef.current = null
      maybeCleanupAfterBackgroundJobs()
    }, 8000)
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
        chatStore.setMessages(event.payload.messages)
        return
      }

      if (
        event.type === CHAT_RUN_EVENTS.MESSAGE_CREATED ||
        event.type === CHAT_RUN_EVENTS.MESSAGE_UPDATED
      ) {
        const { message } = event.payload
        if (message.id && clearedErrorMessageIdsRef.current.has(message.id)) {
          return
        }
        useChatStore.getState().upsertMessage(message)
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
        titleJobPendingRef.current = true
        return
      }

      if (
        event.type === CHAT_RUN_EVENTS.TITLE_GENERATE_COMPLETED ||
        event.type === CHAT_RUN_EVENTS.TITLE_GENERATE_FAILED
      ) {
        titleJobPendingRef.current = false
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === CHAT_RUN_EVENTS.COMPRESSION_STARTED) {
        compressionJobPendingRef.current = true
        return
      }

      if (
        event.type === CHAT_RUN_EVENTS.COMPRESSION_COMPLETED ||
        event.type === CHAT_RUN_EVENTS.COMPRESSION_FAILED
      ) {
        compressionJobPendingRef.current = false
        maybeCleanupAfterBackgroundJobs()
        return
      }

      if (event.type === 'run.completed') {
        void clearPreviousErrorMessage()
        chatStore.setFetchState(false)
        chatStore.setShowLoadingIndicator(false)
        chatStore.setLastMsgStatus(true)
        chatStore.setReadStreamState(false)
        runCompletedRef.current = true
        scheduleDeferredCleanup()
        return
      }

      if (event.type === 'run.failed') {
        void (async () => {
          const error = normalizeError(event.payload.error)
          const errorMessageId = await useChatStore.getState().updateLastAssistantMessageWithError(error)
          if (errorMessageId) {
            lastErrorMessageRef.current = {
              id: errorMessageId,
              chatUuid: useChatStore.getState().currentChatUuid
            }
          }
          resetUiState()
          cleanupActiveRun()
        })()
        return
      }

      if (event.type === 'run.aborted') {
        resetUiState()
        cleanupActiveRun()
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

    chatStore.setCurrentReqCtrl(controller)
    chatStore.setReadStreamState(true)
    chatStore.setFetchState(true)
    chatStore.setShowLoadingIndicator(true)
    chatStore.setLastMsgStatus(false)

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
      resetUiState()
      cleanupActiveRun()
      throw error
    }
  }

  const cancel = () => {
    const submissionId = activeSubmissionIdRef.current
    if (!submissionId) {
      resetUiState()
      return
    }

    if (activeAbortControllerRef.current && !activeAbortControllerRef.current.signal.aborted) {
      activeAbortControllerRef.current.abort()
    } else {
      void invokeChatRunCancel({ submissionId, reason: 'user_cancelled' })
    }

    resetUiState()
    cleanupActiveRun()
  }

  return { onSubmit, cancel }
}

export default useChatSubmitV2
