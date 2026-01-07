import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import { finalizePipeline } from './finalize'
import { prepareMessageAndChat } from './prepare'
import { buildRequest } from './request'
import { ChatPipelineMachine } from './stateMachine'
import { createStreamingPipeline } from './streaming'

function useChatSubmitLegacy() {
  const {
    chatId,
    setChatId,
    chatUuid,
    setChatUuid,
    chatTitle,
    setChatTitle,
    updateChatList,
    setLastMsgStatus
  } = useChatContext()

  const {
    messages,
    selectedModel,
    setMessages,
    setFetchState,
    setCurrentReqCtrl,
    setReadStreamState,
    artifacts,
    setShowLoadingIndicator
  } = useChatStore()

  const {
    providers,
    titleGenerateModel,
    titleGenerateEnabled
  } = useAppConfigStore()

  const beforeFetch = () => setFetchState(true)
  const afterFetch = () => setFetchState(false)

  const onSubmit = async (
    textCtx: string,
    mediaCtx: ClipbordImg[] | string[],
    options: { tools?: any[], prompt: string }
  ): Promise<void> => {

    const machine = new ChatPipelineMachine({
      prepare: prepareMessageAndChat,
      buildRequest,
      createStreamingPipeline: ({ onStateChange }) => createStreamingPipeline({
        setMessages,
        setShowLoadingIndicator,
        artifacts,
        beforeFetch,
        afterFetch,
        onStateChange
      }),
      finalize: (builder) => finalizePipeline(builder, {
        chatTitle,
        setChatTitle,
        setLastMsgStatus,
        setReadStreamState,
        updateChatList,
        titleGenerateEnabled,
        titleGenerateModel,
        selectedModel,
        providers
      })
    })

    const prepareParams = {
      input: { textCtx, mediaCtx, tools: options.tools },
      model: selectedModel!,
      chat: {
        chatId,
        chatUuid,
        setChatId,
        setChatUuid,
        updateChatList
      },
      store: {
        messages,
        artifacts,
        setMessages,
        setCurrentReqCtrl,
        setReadStreamState,
        setShowLoadingIndicator
      },
      providers
    }

    try {
      await machine.start({
        prepareParams,
        prompt: options.prompt
      })
    } catch (error: any) {
      setCurrentReqCtrl(undefined)
      setReadStreamState(false)
      setFetchState(false)
      setShowLoadingIndicator(false)
      setLastMsgStatus(false)

      if (error.name !== 'AbortError') {
        toast.error(error.message)
      }
    } finally {
      setCurrentReqCtrl(undefined)
    }
  }

  return onSubmit
}

export default useChatSubmitLegacy
