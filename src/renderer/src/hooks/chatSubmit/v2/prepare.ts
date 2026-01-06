import { getChatById, saveChat, updateChat } from '@renderer/db/ChatRepository'
import { saveMessage } from '@renderer/db/MessageRepository'
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { v4 as uuidv4 } from 'uuid'
import { systemPrompt as systemPromptBuilder } from '../../../constant/prompts'
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
  const {
    messages,
    setMessages,
    setCurrentReqCtrl,
    setReadStreamState,
    setShowLoadingIndicator
  } = store

  const userMessageEntity: MessageEntity = { body: buildUserMessage(model, textCtx, mediaCtx) }

  let currChatId = chatId
  let chatEntity: ChatEntity
  let workspacePath = ''

  if (!chatUuid && !chatId) {
    const currChatUuid = uuidv4()
    setChatUuid(currChatUuid)

    const workspaceResult = await createWorkspace(currChatUuid)
    if (!workspaceResult.success) {
      console.warn(`[Workspace] Failed to create workspace for chat ${currChatUuid}:`, workspaceResult.error)
    }
    workspacePath = workspaceResult.path

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

    userMessageEntity.chatId = currChatId
    userMessageEntity.chatUuid = currChatUuid
  } else {
    const fetchedChat = await getChatById(currChatId!)
    if (!fetchedChat) {
      throw new Error('Chat not found')
    }
    chatEntity = fetchedChat

    userMessageEntity.chatId = currChatId
    userMessageEntity.chatUuid = chatUuid

    workspacePath = getWorkspacePath(chatUuid)
  }

  const usrMsgId = await saveMessage(userMessageEntity) as number
  let messageEntities = [...messages, userMessageEntity]
  setMessages(messageEntities)

  chatEntity.messages = [...chatEntity.messages, usrMsgId]
  chatEntity.model = model.value
  chatEntity.updateTime = new Date().getTime()
  updateChat(chatEntity)

  const updatedChat = await getChatById(currChatId!)
  if (updatedChat) {
    chatEntity.msgCount = updatedChat.msgCount
  }
  updateChatList(chatEntity)

  const controller = new AbortController()
  setCurrentReqCtrl(controller)
  setReadStreamState(true)
  setShowLoadingIndicator(true)

  const initialAssistantMessage: MessageEntity = {
    body: {
      role: 'assistant',
      model: model.name,
      content: '',
      segments: []
    }
  }
  messageEntities = [...messageEntities, initialAssistantMessage]
  setMessages(messageEntities)

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
      chatMessages: messageEntities.map(msg => msg.body),
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
