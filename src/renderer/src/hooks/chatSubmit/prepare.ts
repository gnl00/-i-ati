import { systemPrompt as systemPromptBuilder } from '@renderer/constant/prompts'
import { getChatById, saveChat, updateChat } from '@renderer/db/ChatRepository'
import { getMessageByIds } from '@renderer/db/MessageRepository'
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { v4 as uuidv4 } from 'uuid'
import type { PrepareMessageFn, PrepareMessageParams, PreparedChat } from './types'
import { MessageManager } from './message-manager'

const buildUserMessage = (
  model: IModel,
  textCtx: string,
  mediaCtx: ClipbordImg[] | string[]
): ChatMessage => {
  let messageBody: ChatMessage = { role: 'user', content: '', segments: [] }

  if (model.type === 'llm') {
    messageBody = { ...messageBody, content: textCtx.trim() }
  } else if (model.type === 'vlm') {
    const imgContents: VLMContent[] = []
    mediaCtx.forEach(imgBase64 => {
      imgContents.push({
        type: 'image_url',
        image_url: { url: imgBase64 as string, detail: 'auto' }
      })
    })
    messageBody = {
      ...messageBody,
      content: [...imgContents, { type: 'text', text: textCtx.trim() }]
    }
  } else if (model.type === 't2i') {
    messageBody = { ...messageBody, content: textCtx.trim() }
  } else {
    throw new Error('Unsupported model type')
  }

  return messageBody
}

export const prepareV2: PrepareMessageFn = async ({
  input,
  model,
  chat,
  store,
  providers
}: PrepareMessageParams): Promise<PreparedChat> => {
  const { textCtx, mediaCtx, tools, prompt } = input
  const {
    chatId,
    chatUuid,
    setChatId,
    setChatUuid,
    updateChatList
  } = chat

  const userMessage: ChatMessage = buildUserMessage(model, textCtx, mediaCtx)

  let currChatId = chatId
  let chatEntity: ChatEntity
  let workspacePath = ''

  // 1. 创建或获取聊天
  if (!chatUuid && !chatId) {
    // 新聊天
    const currChatUuid = uuidv4()
    setChatUuid(currChatUuid)

    const workspaceResult = await createWorkspace(currChatUuid)
    if (!workspaceResult.success) {
      console.warn(`[Workspace] Failed to create workspace for chat ${currChatUuid}:`, workspaceResult.error)
      workspacePath = '/tmp'
    } else {
      workspacePath = workspaceResult.path
    }

    chatEntity = {
      uuid: currChatUuid,
      title: 'NewChat',
      messages: [],
      model: model.value,
      workspacePath: workspacePath, // 保存 workspace 路径到数据库
      createTime: new Date().getTime(),
      updateTime: new Date().getTime()
    }
    const saveChatRetVal = await saveChat(chatEntity)
    currChatId = saveChatRetVal as number
    setChatId(currChatId)
    chatEntity.id = currChatId

    // 设置当前聊天到 store
    store.setCurrentChat(currChatId, currChatUuid)
  } else {
    // 加载已有聊天
    const fetchedChat = await getChatById(currChatId!)
    if (!fetchedChat) {
      throw new Error('Chat not found')
    }
    chatEntity = fetchedChat
    // 优先使用 chat 的自定义 workspacePath，否则使用默认路径
    workspacePath = getWorkspacePath(chatUuid, fetchedChat.workspacePath)

    // 设置当前聊天到 store（在加载消息之前）
    store.setCurrentChat(currChatId!, chatUuid!)
  }

  // 2. 从数据库加载已有消息（如果是已有聊天）
  // 关键优化：直接从数据库加载，不依赖 store.messages 的异步更新
  let existingMessages: MessageEntity[] = []
  if (chatEntity.messages && chatEntity.messages.length > 0) {
    existingMessages = await getMessageByIds(chatEntity.messages)

    // 更新 store.messages（仅用于 UI 显示）
    store.setMessages(existingMessages)
  }

  // 2.5. 清理上一条纯错误消息（如果存在）
  // 检查最后一条 assistant 消息是否只包含 error segment
  const lastMessage = existingMessages[existingMessages.length - 1]
  if (lastMessage && lastMessage.body.role === 'assistant') {
    const segments = lastMessage.body.segments
    // 如果只有一个 segment 且类型为 error，则删除这条消息
    if (segments.length === 1 && segments[0].type === 'error') {
      if (lastMessage.id) {
        await store.deleteMessage(lastMessage.id)
        // 从 existingMessages 中移除
        existingMessages = existingMessages.filter(m => m.id !== lastMessage.id)
        // 从 chatEntity.messages 中移除
        chatEntity.messages = (chatEntity.messages || []).filter(id => id !== lastMessage.id)
        await updateChat(chatEntity)
      }
    }
  }

  const resolvedChatUuid = chatEntity.uuid
  const messageManagerContext = {
    session: {
      messageEntities: [...existingMessages],
      chatEntity,
      currChatId
    },
    systemPrompts: [],
    compressionSummary: null,
    request: { messages: [] }
  }
  const messageManager = new MessageManager(messageManagerContext, store, { enableStreamBuffer: false })

  // 3. 创建用户消息实体
  const userMessageEntity: MessageEntity = {
    body: userMessage,
    chatId: currChatId,
    chatUuid: resolvedChatUuid
  }

  // 4. 保存用户消息（自动 IPC → SQLite → 更新 state）
  await messageManager.persistMessageEntity(userMessageEntity)

  // 5. 更新聊天实体
  chatEntity.model = model.value
  chatEntity.updateTime = new Date().getTime()
  await updateChat(chatEntity)

  // 从数据库重新加载最新的 msgCount 和 workspacePath
  const updatedChat = await getChatById(currChatId!)
  if (updatedChat) {
    chatEntity.msgCount = updatedChat.msgCount
    chatEntity.workspacePath = updatedChat.workspacePath
  }
  updateChatList(chatEntity)

  // 6. 设置控制状态
  const controller = new AbortController()
  store.setCurrentReqCtrl(controller)
  store.setReadStreamState(true)
  store.setShowLoadingIndicator(true)

  // 7. 创建初始助手消息并立即保存到数据库
  const initialAssistantMessage: MessageEntity = {
    body: {
      role: 'assistant',
      model: model.name,
      content: '',
      segments: [],
      typewriterCompleted: false  // 初始化打字机状态
    },
    chatId: currChatId,
    chatUuid: resolvedChatUuid
  }

  // 立即保存到数据库，获取真实 ID
  await messageManager.persistMessageEntity(initialAssistantMessage)
  chatEntity.updateTime = new Date().getTime()
  await updateChat(chatEntity)

  // 8. 构建返回的消息列表（用于当前会话）
  // 关键优化：使用从数据库加载的 existingMessages，而不是 store.messages
  // 这样可以避免 Zustand 状态更新延迟导致的问题
  const allMessages = messageManager.getMessages()
  const messageEntities = [...allMessages]
  const chatMessages = messageEntities.map(msg => msg.body)

  // 8. 构建 system prompts
  const defaultSystemPrompt = systemPromptBuilder(workspacePath)
  const systemPrompts = prompt
    ? [prompt, defaultSystemPrompt]
    : [defaultSystemPrompt]

  return {
    input: {
      textCtx,
      mediaCtx,
      tools
    },
    session: {
      userMessageEntity,
      messageEntities,
      chatMessages,
      chatEntity,
      currChatId,
      workspacePath
    },
    control: {
      controller,
      signal: controller.signal
    },
    meta: {
      model,
      provider: providers.findLast(p => p.name === model.provider)!
    },
    systemPrompts
  }
}
