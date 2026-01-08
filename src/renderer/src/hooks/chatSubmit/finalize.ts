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

  // 2. 处理所有需要持久化的消息（新方案：统一保存顺序）

  // 2.1 第一步：更新所有 assistant 消息（新方案：已在 prepare 阶段保存）
  for (const message of session.messageEntities) {
    if (message.body.role === 'assistant') {
      // 提取 content from segments
      if (message.body.segments && message.body.segments.length > 0) {
        const extractedContent = extractContentFromSegments(message.body.segments)
        message.body.content = extractedContent
      }

      // 新方案：assistant 消息已在 prepare 阶段保存，这里只需要更新
      if (message.id && message.id > 0) {
        await store.updateMessage(message)
      } else {
        // 不应该出现这种情况（没有 ID 的 assistant 消息）
        console.warn('[Finalize] Assistant message without ID, this should not happen in new approach')
      }
    }
  }

  // 2.2 第二步：按顺序保存所有 tool result 消息
  for (const message of session.messageEntities) {
    if (message.body.role === 'tool' && !message.id) {
      // 未保存的 tool result 消息，保存到数据库
      const msgId = await store.addMessage(message)
      message.id = msgId
      chatEntity.messages = [...(chatEntity.messages || []), msgId]
    }
  }

  // 3. 更新聊天实体（使用内存中的 messages 数组）

  // 直接使用内存中的 chatEntity，包含完整的 messages 数组
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
