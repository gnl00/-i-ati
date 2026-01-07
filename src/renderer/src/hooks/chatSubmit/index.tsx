import { useChatContext } from '@renderer/context/ChatContext'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { toast } from 'sonner'
import { finalizePipelineV2 } from './finalize'
import { ChatPipelineMachineV2 } from './machine'
import { prepareV2 } from './prepare'
import { buildRequestV2 } from './request'
import { createStreamingV2 } from './streaming'

function useChatSubmitV2() {
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
    const machine = new ChatPipelineMachineV2({
      prepare: prepareV2,
      buildRequest: buildRequestV2,
      sendRequest: createStreamingV2({
        setMessages,
        setShowLoadingIndicator,
        beforeFetch,
        afterFetch
      }),
      // TODO add one handleResponseState
      finalize: finalizePipelineV2
    })

    const prepareParams = {
      input: { textCtx, mediaCtx, tools: options.tools, prompt: options.prompt },
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
        setMessages,
        setCurrentReqCtrl,
        setReadStreamState,
        setShowLoadingIndicator
      },
      providers
    }

    const finalizeDeps = {
      chatTitle,
      setChatTitle,
      setLastMsgStatus,
      setReadStreamState,
      updateChatList,
      titleGenerateEnabled,
      titleGenerateModel,
      selectedModel,
      providers
    }

    try {
      await machine.start({
        prepareParams,
        finalizeDeps
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

export default useChatSubmitV2
