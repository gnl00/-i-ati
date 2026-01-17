import { generateTitlePrompt } from '@renderer/constant/prompts'
import { getChatById, updateChat } from '@renderer/db/ChatRepository'
import { unifiedChatRequest } from '@request/index'
import { MessageManager } from './streaming/message-manager'
import type { FinalizeDeps, StreamingContextProvider, TitleRequestParams } from './types'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { compressionService } from '@renderer/services/compressionService'

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

  const messageManager = new MessageManager(context, store, { enableStreamBuffer: false })

  // 2.1 第一步：更新所有 assistant 消息（新方案：已在 prepare 阶段保存）
  await messageManager.updateAssistantMessagesFromSegments()

  // 2.2 第二步：按顺序保存所有 tool result 消息
  await messageManager.persistToolMessages()

  // 3. 更新聊天实体（使用内存中的 messages 数组）

  // 直接使用内存中的 chatEntity，包含完整的 messages 数组
  chatEntity.model = meta.model.value
  chatEntity.updateTime = new Date().getTime()
  await updateChat(chatEntity)

  // 4. 从数据库重新加载最新的 msgCount 和 workspacePath
  const updatedChat = await getChatById(chatEntity.id!)
  if (updatedChat) {
    chatEntity.msgCount = updatedChat.msgCount
    chatEntity.workspacePath = updatedChat.workspacePath
  }
  updateChatList(chatEntity)

  // 5. 触发压缩检查（异步执行，不阻塞用户）
  const appConfig = useAppConfigStore.getState()
  const compressionConfig = appConfig.compression

  if (compressionConfig?.enabled && compressionConfig?.autoCompress) {
    // 异步触发压缩，不阻塞用户
    compressionService.compress(
      chatEntity.id!,
      chatEntity.uuid,
      session.messageEntities,
      meta.model,
      meta.provider
    ).catch(error => {
      console.error('[Compression] Failed to compress messages:', error)
    })
  }
}
