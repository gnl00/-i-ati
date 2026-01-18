import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useRef } from 'react'
import {
  ChatSubmissionService,
  ChatSubmitEventBus,
  ChatSubmitEventTraceRecorder,
  DefaultFinalizeService,
  DefaultMessageService,
  DefaultRequestService,
  DefaultSessionService,
  MainDrivenStreamingService
} from './event-driven'

function useChatSubmitV2() {
  const chatContext = useChatContext()
  const chatStore = useChatStore()
  const { accounts, providerDefinitions } = useAppConfigStore()

  const activeSubmissionRef = useRef<ChatSubmissionService | null>(null)
  const activeBusRef = useRef<ChatSubmitEventBus | null>(null)

  const resetUiState = () => {
    chatStore.setCurrentReqCtrl(undefined)
    chatStore.setReadStreamState(false)
    chatStore.setFetchState(false)
    chatStore.setShowLoadingIndicator(false)
    chatContext.setLastMsgStatus(false)
  }

  const bindEventHandlers = (bus: ChatSubmitEventBus, recorder: ChatSubmitEventTraceRecorder) => {
    const handledOnce = new Set<string>()
    const markOnce = (type: string, submissionId?: string) => {
      const key = submissionId ? `${type}:${submissionId}` : type
      if (handledOnce.has(key)) {
        return false
      }
      handledOnce.add(key)
      return true
    }

    const upsertOrAppend = (message: MessageEntity) => {
      const state = useChatStore.getState()
      const messages = state.messages
      const messageId = message.id
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

    const unsubscribers = [
      bus.on('session.ready', ({ chatEntity, workspacePath, controller }, envelope) => {
        if (!markOnce('session.ready', envelope.submissionId)) {
          return
        }
        chatContext.setChatId(chatEntity.id)
        chatContext.setChatUuid(chatEntity.uuid)
        chatStore.setCurrentChat(chatEntity.id || null, chatEntity.uuid || null)
        chatContext.updateChatList(chatEntity)
        if (chatEntity.title) {
          chatContext.setChatTitle(chatEntity.title)
        }
        chatStore.setCurrentReqCtrl(controller)
        chatStore.setReadStreamState(true)
        chatStore.setShowLoadingIndicator(true)
        chatStore.setFetchState(true)
        void workspacePath
      }),
      bus.on('messages.loaded', ({ messages }, envelope) => {
        if (!markOnce('messages.loaded', envelope.submissionId)) {
          return
        }
        chatStore.setMessages(messages)
      }),
      bus.on('message.created', ({ message }) => {
        upsertOrAppend(message)
      }),
      bus.on('message.updated', ({ message }) => {
        upsertOrAppend(message)
      }),
      bus.on('tool.result.attached', ({ message }) => {
        upsertOrAppend(message)
      }),
      bus.on('chat.updated', ({ chatEntity }) => {
        chatContext.updateChatList(chatEntity)
        if (chatEntity.title) {
          chatContext.setChatTitle(chatEntity.title)
        }
      }),
      bus.on('stream.completed', ({ ok }, envelope) => {
        if (!markOnce('stream.completed', envelope.submissionId)) {
          return
        }
        chatStore.setFetchState(false)
        chatStore.setShowLoadingIndicator(false)
      }),
      bus.on('submission.completed', (_, envelope) => {
        if (!markOnce('submission.completed', envelope.submissionId)) {
          return
        }
        chatContext.setLastMsgStatus(true)
        chatStore.setReadStreamState(false)
      }),
      bus.on('submission.failed', async ({ error }, envelope) => {
        if (!markOnce('submission.failed', envelope.submissionId)) {
          return
        }
        await chatStore.updateLastAssistantMessageWithError(error)
        resetUiState()
      }),
      bus.on('submission.aborted', (_, envelope) => {
        if (!markOnce('submission.aborted', envelope.submissionId)) {
          return
        }
        resetUiState()
      })
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
      recorder.close()
      bus.close()
    }
  }

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ): Promise<void> => {
    if (activeSubmissionRef.current) {
      return
    }

    const bus = new ChatSubmitEventBus()
    const recorder = new ChatSubmitEventTraceRecorder()
    const cleanup = bindEventHandlers(bus, recorder)
    recorder.bind(bus)
    activeBusRef.current = bus

    const messageService = new DefaultMessageService()
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
          tools: options.tools,
          prompt: options.prompt
        },
        modelRef: chatStore.selectedModelRef!,
        accounts,
        providerDefinitions,
        chatId: chatContext.chatId,
        chatUuid: chatContext.chatUuid
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
