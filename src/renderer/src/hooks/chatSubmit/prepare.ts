import { systemPrompt as systemPromptBuilder } from '@renderer/constant/prompts'
import { getChatById, saveChat, updateChat } from '@renderer/db/ChatRepository'
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { v4 as uuidv4 } from 'uuid'
import type { PrepareMessageFn, PrepareMessageParams, PreparedChat } from './types'

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
    workspacePath = getWorkspacePath(chatUuid)

    // 设置当前聊天到 store
    store.setCurrentChat(currChatId!, chatUuid!)
  }

  // 2. 创建用户消息实体
  const userMessageEntity: MessageEntity = {
    body: userMessage,
    chatId: currChatId,
    chatUuid: chatUuid
  }

  // 3. 通过 store action 保存用户消息（自动 IPC → SQLite → 更新 state）
  const usrMsgId = await store.addMessage(userMessageEntity)

  // 4. 通过 store action 加载聊天消息（自动从 SQLite → IPC → 更新 state）
  await store.loadChat(currChatId!)

  // 5. 更新聊天实体
  chatEntity.messages = [...(chatEntity.messages || []), usrMsgId]
  chatEntity.model = model.value
  chatEntity.updateTime = new Date().getTime()
  await updateChat(chatEntity)

  // 从数据库重新加载最新的 msgCount
  const updatedChat = await getChatById(currChatId!)
  if (updatedChat) {
    chatEntity.msgCount = updatedChat.msgCount
  }
  updateChatList(chatEntity)

  // 6. 设置控制状态
  const controller = new AbortController()
  store.setCurrentReqCtrl(controller)
  store.setReadStreamState(true)
  store.setShowLoadingIndicator(true)

  // 7. 创建初始助手消息（仅内存，不持久化）
  // 使用临时 ID 标记，确保流式更新时能正确追踪这条消息
  const initialAssistantMessage: MessageEntity = {
    id: -1,  // 临时 ID，finalize 时会被真实 ID 替换
    body: {
      role: 'assistant',
      model: model.name,
      content: '',
      segments: []
    }
  }

  // 8. 构建返回的消息列表（用于当前会话）
  const messages = store.messages
  const messageEntities = [...messages, initialAssistantMessage]
  const chatMessages = messageEntities.map(msg => msg.body)

  // 9. 构建 system prompts
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
