import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'
import type { ConversationStore } from '@main/agent/contracts'
import DatabaseService from '@main/db/DatabaseService'
import EmotionInferenceService from '@main/services/emotion/EmotionInferenceService'
import {
  buildNextEmotionStateSnapshot,
  extractEmotionToolStateFromSegments,
  hasVisibleAssistantText
} from '@main/services/emotion/emotion-state'
import type { HostRunInputState } from '../preparation'

const buildUserMessage = (
  model: AccountModel,
  textCtx: string,
  mediaCtx: ClipbordImg[] | string[],
  source?: string,
  host?: ChatMessageHostMeta
): ChatMessage => {
  const createdAt = Date.now()
  let messageBody: ChatMessage = {
    role: 'user',
    content: '',
    segments: [],
    createdAt,
    ...(source ? { source } : {}),
    ...(host ? { host } : {})
  }

  if (model.type === 'llm' || model.type === 'img_gen') {
    return { ...messageBody, content: textCtx.trim() }
  }

  if (model.type === 'vlm' || model.type === 'mllm') {
    const imgContents: VLMContent[] = mediaCtx.map((imgBase64) => ({
      type: 'image_url' as const,
      image_url: { url: imgBase64 as string, detail: 'auto' as const }
    }))

    return {
      ...messageBody,
      content: [...imgContents, { type: 'text', text: textCtx.trim() }]
    }
  }

  throw new Error('Unsupported model type')
}

export class ChatStepStore implements ConversationStore {
  createUserMessage(
    chatEntity: ChatEntity,
    model: AccountModel,
    input: HostRunInputState
  ): MessageEntity {
    const entity: MessageEntity = {
      body: buildUserMessage(model, input.textCtx, input.mediaCtx, input.source, input.host),
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    entity.id = DatabaseService.saveMessage(entity)
    this.attachMessageToChat(chatEntity, entity.id)
    return entity
  }

  buildAssistantDraft(
    chatEntity: ChatEntity,
    model: AccountModel,
    modelRef: ModelRef,
    source?: string,
    host?: ChatMessageHostMeta
  ): MessageEntity {
    return {
      body: {
        createdAt: Date.now(),
        role: 'assistant',
        model: model.label,
        modelRef,
        content: '',
        segments: [],
        typewriterCompleted: false,
        ...(source ? { source } : {}),
        ...(host ? { host } : {})
      },
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }
  }

  persistToolResultMessage(
    toolMsg: ChatMessage,
    chatId?: number,
    chatUuid?: string
  ): MessageEntity {
    const entity: MessageEntity = {
      body: toolMsg,
      chatId,
      chatUuid
    }

    entity.id = DatabaseService.saveMessage(entity)
    return entity
  }

  persistAssistantMessage(message: MessageEntity): MessageEntity {
    if (message.id != null) {
      DatabaseService.updateMessage(message)
      return message
    }

    message.id = DatabaseService.saveMessage(message)

    const chatEntity = this.resolveChatEntity(message.chatId, message.chatUuid)
    if (chatEntity) {
      this.attachMessageToChat(chatEntity, message.id)
    }

    return message
  }

  async finalizeAssistantMessage(
    chatEntity: ChatEntity,
    finalAssistantMessage: MessageEntity,
    usage?: ITokenUsage
  ): Promise<MessageEntity> {
    const content = finalAssistantMessage.body.segments?.length
      ? extractContentFromSegments(finalAssistantMessage.body.segments)
      : finalAssistantMessage.body.content

    const emotionToolState = extractEmotionToolStateFromSegments(finalAssistantMessage.body)
    const emotionFromTool = emotionToolState?.emotion
    const fallbackEmotion = emotionFromTool
      ? undefined
      : hasVisibleAssistantText(content)
        ? await EmotionInferenceService.infer(content)
        : null

    const updated: MessageEntity = {
      ...finalAssistantMessage,
      ...(usage ? { tokens: usage.totalTokens } : {}),
      body: {
        ...finalAssistantMessage.body,
        content,
        ...(emotionFromTool ? { emotion: emotionFromTool } : {}),
        ...(!emotionFromTool && fallbackEmotion ? { emotion: fallbackEmotion } : {}),
        typewriterCompleted: true
      }
    }

    if (updated.id != null) {
      DatabaseService.updateMessage(updated)
    } else {
      updated.id = DatabaseService.saveMessage(updated)
      this.attachMessageToChat(chatEntity, updated.id)
    }

    if (updated.chatId && updated.chatUuid && updated.body.emotion) {
      const previousState = DatabaseService.getEmotionStateByChatId(updated.chatId)
      const nextState = buildNextEmotionStateSnapshot(previousState, updated.body.emotion, {
        accumulated: emotionToolState?.accumulated
      })
      DatabaseService.upsertEmotionState(updated.chatId, updated.chatUuid, nextState)
    }

    return updated
  }

  async settleAbortedAssistantMessage(
    chatEntity: ChatEntity,
    lastAssistantMessage: MessageEntity
  ): Promise<MessageEntity | undefined> {
    if (this.hasPersistableAssistantPayload(lastAssistantMessage.body)) {
      return await this.finalizeAssistantMessage(chatEntity, lastAssistantMessage)
    }

    return undefined
  }

  private hasPersistableAssistantPayload(message: ChatMessage): boolean {
    const hasContent = typeof message.content === 'string'
      ? message.content.trim().length > 0
      : Array.isArray(message.content) && message.content.length > 0

    const hasSegments = Array.isArray(message.segments) && message.segments.length > 0
    const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0

    return hasContent || hasSegments || hasToolCalls
  }

  private attachMessageToChat(chatEntity: ChatEntity, messageId?: number): void {
    if (messageId == null) {
      return
    }

    chatEntity.messages = [...(chatEntity.messages || []), messageId]
    chatEntity.updateTime = Date.now()
    DatabaseService.updateChat(chatEntity)
  }

  private resolveChatEntity(chatId?: number, chatUuid?: string): ChatEntity | undefined {
    if (chatId != null) {
      const chat = DatabaseService.getChatById(chatId)
      if (chat) {
        return chat
      }
    }

    if (chatUuid) {
      return DatabaseService.getChatByUuid(chatUuid)
    }

    return undefined
  }
}
