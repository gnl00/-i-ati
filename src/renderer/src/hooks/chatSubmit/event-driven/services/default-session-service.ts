import { systemPrompt as systemPromptBuilder } from '@renderer/constant/prompts'
import { getChatById, saveChat } from '@renderer/db/ChatRepository'
import { getMessageByIds } from '@renderer/db/MessageRepository'
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { v4 as uuidv4 } from 'uuid'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { SessionPrepareInput, SessionService } from './session-service'

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

export class DefaultSessionService implements SessionService {
  async prepare(
    input: SessionPrepareInput,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    const { input: chatInput, model, providers } = input
    let { chatId, chatUuid } = input

    let chatEntity: ChatEntity
    let workspacePath = ''

    if (!chatUuid && !chatId) {
      const currChatUuid = uuidv4()
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
        workspacePath,
        createTime: Date.now(),
        updateTime: Date.now()
      }

      chatId = await saveChat(chatEntity)
      chatEntity.id = chatId
      chatUuid = currChatUuid
    } else {
      const fetchedChat = await getChatById(chatId!)
      if (!fetchedChat) {
        throw new Error('Chat not found')
      }
      chatEntity = fetchedChat
      chatUuid = fetchedChat.uuid
      workspacePath = getWorkspacePath(chatUuid, fetchedChat.workspacePath)
    }

    const metaWithChat = { ...meta, chatId, chatUuid }

    let existingMessages: MessageEntity[] = []
    if (chatEntity.messages && chatEntity.messages.length > 0) {
      existingMessages = await getMessageByIds(chatEntity.messages)
    }

    const userMessageBody = buildUserMessage(model, chatInput.textCtx, chatInput.mediaCtx)
    const userMessageEntity: MessageEntity = {
      body: userMessageBody,
      chatId: chatId,
      chatUuid: chatUuid
    }

    const defaultSystemPrompt = systemPromptBuilder(workspacePath)
    const systemPrompts = chatInput.prompt
      ? [chatInput.prompt, defaultSystemPrompt]
      : [defaultSystemPrompt]

    const controller = input.controller || new AbortController()

    const context: SubmissionContext = {
      input: chatInput,
      session: {
        userMessageEntity,
        messageEntities: [...existingMessages],
        chatMessages: existingMessages.map(msg => msg.body),
        chatEntity,
        currChatId: chatId,
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

    await publisher.emit('session.ready', { chatEntity, workspacePath, controller }, metaWithChat)
    if (existingMessages.length > 0) {
      await publisher.emit('messages.loaded', { messages: existingMessages }, metaWithChat)
    }

    return context
  }
}
