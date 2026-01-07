import { generateTitlePrompt } from '@renderer/constant/prompts'
import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { unifiedChatRequest } from '@request/index'
import { extractContentFromSegments } from './streaming/segment-utils'
import type { FinalizeDeps, StreamingContextProvider, TitleRequestParams } from './types'

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
    providers,
    store
  } = deps

  setLastMsgStatus(true)
  setReadStreamState(false)

  // 1. 生成标题
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

  // 2. ✅ 保存所有未保存的消息（通过 Zustand store actions）
  // 注意：区分临时 ID（字符串）和数据库 ID（数字）
  const unsavedMessages = session.messageEntities.filter(msg => typeof msg.id !== 'number')

  if (unsavedMessages.length > 0) {
    for (const messageToSave of unsavedMessages) {
      // 提取 content from segments
      if (!messageToSave.body.content && messageToSave.body.segments && messageToSave.body.segments.length > 0) {
        const extractedContent = extractContentFromSegments(messageToSave.body.segments)
        messageToSave.body.content = extractedContent
      }

      // ✅ 通过 store action 保存（自动 IPC → SQLite → 更新 state）
      const msgId = await store.addMessage(messageToSave)

      // 更新聊天实体的消息列表
      chatEntity.messages = [...(chatEntity.messages || []), msgId]
    }

    // 3. 更新聊天实体
    chatEntity.model = meta.model.value
    chatEntity.updateTime = new Date().getTime()
    await updateChat(chatEntity)

    // 4. 从数据库重新加载最新的 msgCount
    const updatedChat = await getChatById(chatEntity.id!)
    if (updatedChat) {
      chatEntity.msgCount = updatedChat.msgCount
    }
    updateChatList(chatEntity)
  }
}
