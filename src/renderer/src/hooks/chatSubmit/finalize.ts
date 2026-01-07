import { saveMessage } from '@renderer/db/MessageRepository'
import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { unifiedChatRequest } from '@request/index'
import type { FinalizeDeps, TitleRequestParams, StreamingContextProvider } from './types'
import { generateTitlePrompt } from '../../../constant/prompts'
import { lastMessageHasContent } from './streaming/segment-utils'

const providerTypeMap: Record<string, ProviderType> = {
  'Anthropic': 'claude',
  'Claude': 'claude'
}

export const generateTitleV2 = async ({
  content,
  titleGenerateModel,
  selectedModel,
  providers,
  setChatTitle
}: TitleRequestParams): Promise<string> => {
  const model = (titleGenerateModel || selectedModel)!
  let titleProvider = providers.findLast(p => p.name === model.provider)!

  const providerType = providerTypeMap[titleProvider.name] || 'openai'

  const titleReq: IUnifiedRequest = {
    providerType,
    apiVersion: 'v1',
    baseUrl: titleProvider.apiUrl,
    apiKey: titleProvider.apiKey,
    model: model.value,
    prompt: generateTitlePrompt,
    messages: [{ role: 'user', content, segments: [] }],
    stream: false,
    options: {
      temperature: 0.7,
      maxTokens: 100,
      topP: 0.7
    }
  }

  const response = await unifiedChatRequest(titleReq, null, () => { }, () => { })
  const title: string = response.content
  setChatTitle(title)
  return title
}

export const finalizePipelineV2 = async (
  builder: StreamingContextProvider,
  deps: FinalizeDeps
): Promise<void> => {
  const context = builder.requireStreamingContext()
  const { session, input, meta } = context
  const { chatEntity } = session

  const {
    chatTitle,
    setChatTitle,
    setLastMsgStatus,
    setReadStreamState,
    updateChatList,
    titleGenerateEnabled,
    titleGenerateModel,
    selectedModel,
    providers
  } = deps

  setLastMsgStatus(true)
  setReadStreamState(false)

  if (!chatTitle || (chatTitle === 'NewChat')) {
    let title = input.textCtx.substring(0, 30)
    if (titleGenerateEnabled) {
      title = await generateTitleV2({
        content: input.textCtx,
        titleGenerateModel,
        selectedModel,
        providers,
        setChatTitle
      })
    }
    chatEntity.title = title
    setChatTitle(title)
  }

  if (lastMessageHasContent(session.messageEntities)) {
    const lastMessage = session.messageEntities[session.messageEntities.length - 1]

    const messageToSave: MessageEntity = {
      ...lastMessage,
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    const sysMsgId = await saveMessage(messageToSave) as number
    chatEntity.messages = [...chatEntity.messages, sysMsgId]
    chatEntity.model = meta.model.value
    chatEntity.updateTime = new Date().getTime()
    updateChat(chatEntity)

    const updatedChat = await getChatById(chatEntity.id!)
    if (updatedChat) {
      chatEntity.msgCount = updatedChat.msgCount
    }
    updateChatList(chatEntity)
  }
}
