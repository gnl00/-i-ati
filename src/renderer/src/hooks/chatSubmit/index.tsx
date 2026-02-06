import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import toolsDefinitions from '@tools/definitions'
import { useRef } from 'react'
import {
  ChatSubmissionService,
  ChatSubmitEventBus,
  DefaultFinalizeService,
  DefaultMessageService,
  DefaultRequestService,
  DefaultSessionService,
  MainDrivenStreamingService,
  SubmissionEventService
} from './event-driven'

function useChatSubmitV2() {
  const chatStore = useChatStore()
  const { accounts, providerDefinitions } = useAppConfigStore()

  const activeSubmissionRef = useRef<ChatSubmissionService | null>(null)
  const activeBusRef = useRef<ChatSubmitEventBus | null>(null)
  const lastErrorMessageRef = useRef<{ id: number; chatUuid: string | null } | null>(null)
  const clearedErrorMessageIdsRef = useRef<Set<number>>(new Set())

  const resetUiState = () => {
    chatStore.setCurrentReqCtrl(undefined)
    chatStore.setReadStreamState(false)
    chatStore.setFetchState(false)
    chatStore.setShowLoadingIndicator(false)
    chatStore.setLastMsgStatus(false)
  }

  const bindEventHandlers = (bus: ChatSubmitEventBus) => {
    const submissionEventService = new SubmissionEventService()
    type Unsubscriber = () => void

    const upsertOrAppend = (message: MessageEntity) => {
      const state = useChatStore.getState()
      const messages = state.messages
      const messageId = message.id
      if (messageId && clearedErrorMessageIdsRef.current.has(messageId)) {
        return
      }
      let nextMessages = messages
      if (messageId) {
        const index = messages.findIndex((item) => item.id === messageId)
        if (index >= 0) {
          nextMessages = messages.map((item) => (item.id === messageId ? message : item))
        } else {
          nextMessages = [...messages, message]
        }
      } else {
        nextMessages = [...messages, message]
      }
      state.setMessages(nextMessages)
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

    const registerSessionAndChatHandlers = (): Unsubscriber[] => [
      bus.on('session.ready', ({ chatEntity, workspacePath, controller }, envelope) => {
        if (!submissionEventService.markOnce('session.ready', envelope.submissionId)) {
          return
        }
        chatStore.setChatId(chatEntity.id || null)
        chatStore.setChatUuid(chatEntity.uuid || null)
        chatStore.setCurrentChat(chatEntity.id || null, chatEntity.uuid || null)
        chatStore.updateChatList(chatEntity)
        if (chatEntity.title) {
          chatStore.setChatTitle(chatEntity.title)
        }
        chatStore.setCurrentReqCtrl(controller)
        chatStore.setReadStreamState(true)
        chatStore.setShowLoadingIndicator(true)
        chatStore.setFetchState(true)
        void workspacePath
      }),
      bus.on('messages.loaded', ({ messages }, envelope) => {
        if (!submissionEventService.markOnce('messages.loaded', envelope.submissionId)) {
          return
        }
        chatStore.setMessages(messages)
      }),
      bus.on('chat.updated', ({ chatEntity }) => {
        chatStore.updateChatList(chatEntity)
        if (chatEntity.title) {
          chatStore.setChatTitle(chatEntity.title)
        }
      }),
    ]

    const registerMessageAndToolHandlers = (): Unsubscriber[] => [
      bus.on('message.created', ({ message }) => {
        upsertOrAppend(message)
      }),
      bus.on('message.updated', ({ message }) => {
        upsertOrAppend(message)
      }),
      bus.on('tool.result.attached', ({ message }) => {
        upsertOrAppend(message)
      }),
    ]

    const registerLifecycleHandlers = (): Unsubscriber[] => [
      bus.on('stream.completed', (_, envelope) => {
        if (!submissionEventService.markOnce('stream.completed', envelope.submissionId)) {
          return
        }
        chatStore.setFetchState(false)
        chatStore.setShowLoadingIndicator(false)
      }),
      bus.on('submission.completed', async (_, envelope) => {
        if (!submissionEventService.markOnce('submission.completed', envelope.submissionId)) {
          return
        }
        await clearPreviousErrorMessage()
        chatStore.setLastMsgStatus(true)
        chatStore.setReadStreamState(false)
      }),
      bus.on('submission.failed', async ({ error }, envelope) => {
        if (!submissionEventService.markOnce('submission.failed', envelope.submissionId)) {
          return
        }
        const errorMessageId = await chatStore.updateLastAssistantMessageWithError(error)
        if (errorMessageId) {
          lastErrorMessageRef.current = {
            id: errorMessageId,
            chatUuid: chatStore.currentChatUuid
          }
        }
        resetUiState()
      }),
      bus.on('submission.aborted', (_, envelope) => {
        if (!submissionEventService.markOnce('submission.aborted', envelope.submissionId)) {
          return
        }
        resetUiState()
      })
    ]

    const unsubscribers = [
      ...registerSessionAndChatHandlers(),
      ...registerMessageAndToolHandlers(),
      ...registerLifecycleHandlers()
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
      bus.close()
    }
  }

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[]; prompt?: string; stream?: boolean; options?: IUnifiedRequest['options'] }
  ): Promise<void> => {
    if (activeSubmissionRef.current) {
      return
    }

    const bus = new ChatSubmitEventBus()
    const cleanup = bindEventHandlers(bus)
    activeBusRef.current = bus

    const messageService = new DefaultMessageService()
    const state = useChatStore.getState()
    const toolsByName = new Map<string, any>()
    const normalizeToolDef = (tool: any): any => tool?.function ?? tool
    const findToolDefinition = (name: string) => {
      const match = (toolsDefinitions as any[]).find(tool => tool?.function?.name === name)
      return match?.function ?? match
    }

    state.getAllMcpTools().forEach(tool => {
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

    if (options.tools && options.tools.length > 0) {
      options.tools.forEach(tool => {
        const normalized = normalizeToolDef(tool)
        const name = normalized?.name
        if (name) {
          toolsByName.set(name, normalized)
        }
      })
    }
    const submissionService = new ChatSubmissionService({
      sessionService: new DefaultSessionService(),
      messageService,
      requestService: new DefaultRequestService(),
      streamingService: new MainDrivenStreamingService(messageService),
      finalizeService: new DefaultFinalizeService(messageService)
    })
    activeSubmissionRef.current = submissionService

    let shouldReset = false
    try {
      await submissionService.submit({
        input: {
          textCtx,
          mediaCtx,
          tools: Array.from(toolsByName.values()),
          prompt: options.prompt,
          options: options.options,
          stream: options.stream
        },
        modelRef: chatStore.selectedModelRef!,
        accounts,
        providerDefinitions,
        chatId: chatStore.currentChatId ?? undefined,
        chatUuid: chatStore.currentChatUuid ?? undefined
      }, bus)
    } catch (error: any) {
      shouldReset = true
    } finally {
      if (shouldReset) {
        resetUiState()
      }
      cleanup()
      activeSubmissionRef.current = null
      activeBusRef.current = null
      chatStore.setCurrentReqCtrl(undefined)
    }
  }

  const cancel = () => {
    const submission = activeSubmissionRef.current
    if (submission) {
      submission.cancel('user_cancelled')
      activeSubmissionRef.current = null
      activeBusRef.current?.close()
      activeBusRef.current = null
    }
    resetUiState()
  }

  return { onSubmit, cancel }
}

export default useChatSubmitV2
