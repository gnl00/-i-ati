import { systemPrompt as systemPromptBuilder } from '@shared/prompts'
import { getChatById, saveChat } from '@renderer/db/ChatRepository'
import { getChatSkills } from '@renderer/db/ChatSkillRepository'
import { getSkillContent, listInstalledSkills } from '@renderer/services/skills/SkillService'
import { buildSkillsPrompt } from '@renderer/services/skills/SkillPromptBuilder'
import { getMessageByIds } from '@renderer/db/MessageRepository'
import { createWorkspace, getWorkspacePath } from '@renderer/utils/workspaceUtils'
import { v4 as uuidv4 } from 'uuid'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { SessionPrepareInput, SessionService } from './session-service'

const buildUserMessage = (
  model: AccountModel,
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
    const { input: chatInput, modelRef, accounts, providerDefinitions } = input
    let { chatId, chatUuid } = input

    const account = accounts.find(item => item.id === modelRef.accountId)
    if (!account) {
      throw new Error('Account not found')
    }

    const model = account.models.find(item => item.id === modelRef.modelId)
    if (!model) {
      throw new Error('Model not found')
    }

    const providerDefinition = providerDefinitions.find(def => def.id === account.providerId)
    if (!providerDefinition) {
      throw new Error('Provider definition not found')
    }

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
        model: model.id,
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
    let skillsPrompt = ''
    try {
      const availableSkills = await listInstalledSkills()
      const chatSkills = chatId ? await getChatSkills(chatId) : []
      if (availableSkills.length > 0 || chatSkills.length > 0) {
        const loadedSkills = await Promise.all(
          chatSkills.map(async (name) => {
            try {
              const content = await getSkillContent(name)
              return { name, content }
            } catch (error) {
              console.warn(`[Skills] Failed to load skill content: ${name}`, error)
              return null
            }
          })
        )
        skillsPrompt = buildSkillsPrompt(
          availableSkills,
          loadedSkills.filter(Boolean) as { name: string; content: string }[]
        )
      }
    } catch (error) {
      console.warn('[Skills] Failed to build skills prompt:', error)
    }

    const skillSlotToken = '$$skill-slot$$'
    const composedSystemPrompt = defaultSystemPrompt.includes(skillSlotToken)
      ? defaultSystemPrompt.replace(skillSlotToken, skillsPrompt)
      : `${defaultSystemPrompt}${skillsPrompt}`
    const systemPrompts = chatInput.prompt
      ? [chatInput.prompt, composedSystemPrompt]
      : [composedSystemPrompt]

    const controller = input.controller || new AbortController()

    const snapshot: RequestSnapshot = {
      providerDefinition,
      account,
      model,
      providerType: providerDefinition.adapterType,
      apiVersion: providerDefinition.apiVersion
    }

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
        account,
        providerDefinition,
        snapshot
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
