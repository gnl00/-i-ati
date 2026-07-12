import { extractContentFromSegments } from '@main/services/messages/MessageSegmentContent'
import type { ConversationStore } from '@main/agent/contracts'
import { chatDb } from '@main/db/chat'
import EmotionInferenceService from '@main/services/emotion/EmotionInferenceService'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { escapeXmlAttribute } from '@shared/utils/xml'
import {
  buildNextEmotionStateSnapshot,
  extractEmotionToolStateFromSegments,
  hasVisibleAssistantText
} from '@main/services/emotion/emotion-state'
import type { HostRunInputState } from '../preparation'

type RunStoppedBoundaryOptions = {
  submissionId?: string
  reason?: string
}

const RUN_STOPPED_DEFAULT_REASON = 'user_cancelled'

const buildRunStoppedBoundaryContent = (reason: string): string => [
  `<run_boundary status="stopped" reason="${escapeXmlAttribute(reason)}">`,
  'The previous assistant run was stopped by the user before completion. Treat any in-progress task from that run as ended.',
  '</run_boundary>'
].join('\n')

const buildUserMessage = (
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

  const imageUrls = normalizeMediaUrls(mediaCtx)
  if (imageUrls.length > 0) {
    const imgContents: VLMContent[] = imageUrls.map((imgBase64) => ({
      type: 'image_url' as const,
      image_url: { url: imgBase64, detail: 'auto' as const }
    }))

    return {
      ...messageBody,
      content: [...imgContents, { type: 'text', text: textCtx.trim() }]
    }
  }

  return { ...messageBody, content: textCtx.trim() }
}

export const normalizeMediaUrls = (mediaCtx: ClipbordImg[] | string[]): string[] => (
  mediaCtx
    .map((media) => {
      if (!media) {
        return ''
      }

      if (typeof media === 'string') {
        return media
      }

      if (media instanceof ArrayBuffer) {
        return ''
      }

      const maybeContent = media as unknown as VLMContent
      if (maybeContent.type === 'image_url' && maybeContent.image_url?.url) {
        return maybeContent.image_url.url
      }

      return String(media)
    })
    .map(media => media.trim())
    .filter(Boolean)
)

export class ChatStepStore implements ConversationStore {
  createUserMessage(
    chatEntity: ChatEntity,
    _model: AccountModel,
    input: HostRunInputState
  ): MessageEntity {
    const entity: MessageEntity = {
      body: buildUserMessage(input.textCtx, input.mediaCtx, input.source, input.host),
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid
    }

    entity.id = chatDb.saveMessage(entity)
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

  persistVisionObservationMessage(
    chatEntity: ChatEntity,
    content: string,
    host?: ChatMessageHostMeta
  ): MessageEntity {
    const body: ChatMessage = {
      createdAt: Date.now(),
      role: 'user',
      source: MESSAGE_SOURCE.VISION_OBSERVATION,
      content,
      segments: [],
      ...(host ? { host } : {})
    }
    const entity: MessageEntity = {
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid,
      body
    }

    entity.id = chatDb.saveMessage(entity)
    this.attachMessageToChat(chatEntity, entity.id)
    return entity
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

    entity.id = chatDb.saveMessage(entity)
    return entity
  }

  persistAssistantMessage(message: MessageEntity): MessageEntity {
    if (message.id != null) {
      chatDb.updateMessage(message)
      return message
    }

    message.id = chatDb.saveMessage(message)

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
      ...(usage ? { tokens: usage.totalTokens, tokenUsage: usage } : {}),
      body: {
        ...finalAssistantMessage.body,
        content,
        ...(emotionFromTool ? { emotion: emotionFromTool } : {}),
        ...(!emotionFromTool && fallbackEmotion ? { emotion: fallbackEmotion } : {}),
        typewriterCompleted: true
      }
    }

    if (updated.id != null) {
      chatDb.updateMessage(updated)
    } else {
      updated.id = chatDb.saveMessage(updated)
      this.attachMessageToChat(chatEntity, updated.id)
    }

    if (updated.chatId && updated.chatUuid && updated.body.emotion) {
      const previousState = chatDb.getEmotionStateByChatId(updated.chatId)
      const nextState = buildNextEmotionStateSnapshot(previousState, updated.body.emotion, {
        accumulated: emotionToolState?.accumulated
      })
      chatDb.upsertEmotionState(updated.chatId, updated.chatUuid, nextState)
    }

    return updated
  }

  async settleAbortedAssistantMessage(
    chatEntity: ChatEntity,
    lastAssistantMessage: MessageEntity,
    messageEntities: MessageEntity[] = []
  ): Promise<MessageEntity | undefined> {
    if (this.hasUnansweredToolCalls(chatEntity, lastAssistantMessage.body, messageEntities)) {
      return undefined
    }

    if (this.hasPersistableAssistantPayload(lastAssistantMessage.body)) {
      return await this.finalizeAssistantMessage(chatEntity, lastAssistantMessage)
    }

    return undefined
  }

  persistRunStoppedBoundaryMessage(
    chatEntity: ChatEntity,
    lastAssistantMessage?: MessageEntity,
    options: RunStoppedBoundaryOptions = {}
  ): MessageEntity {
    const existing = this.findRunStoppedBoundaryMessage(chatEntity, options.submissionId)
    if (existing) {
      return existing
    }

    const reason = options.reason || RUN_STOPPED_DEFAULT_REASON
    const stoppedAt = Date.now()
    const body: ChatMessage = {
      createdAt: stoppedAt,
      role: 'assistant',
      source: MESSAGE_SOURCE.RUN_STOPPED,
      model: lastAssistantMessage?.body.model,
      modelRef: lastAssistantMessage?.body.modelRef,
      content: buildRunStoppedBoundaryContent(reason),
      runBoundary: {
        status: 'stopped',
        reason,
        ...(options.submissionId ? { submissionId: options.submissionId } : {}),
        stoppedAt
      },
      segments: [],
      typewriterCompleted: true
    }

    const entity: MessageEntity = {
      chatId: chatEntity.id,
      chatUuid: chatEntity.uuid,
      body
    }

    entity.id = chatDb.saveMessage(entity)
    this.attachMessageToChat(chatEntity, entity.id)
    return entity
  }

  private findRunStoppedBoundaryMessage(
    chatEntity: ChatEntity,
    submissionId?: string
  ): MessageEntity | undefined {
    if (!submissionId) {
      return undefined
    }

    const latestChat = this.resolveChatEntity(chatEntity.id, chatEntity.uuid) ?? chatEntity
    for (const messageId of latestChat.messages || []) {
      const entity = chatDb.getMessageById(messageId)
      if (
        entity?.body.source === MESSAGE_SOURCE.RUN_STOPPED
        && entity.body.runBoundary?.submissionId === submissionId
      ) {
        return entity
      }
    }

    return undefined
  }

  private hasUnansweredToolCalls(
    chatEntity: ChatEntity,
    message: ChatMessage,
    messageEntities: MessageEntity[]
  ): boolean {
    const toolCalls = message.toolCalls || []
    if (toolCalls.length === 0) {
      return false
    }

    const answeredToolCallIds = new Set<string>()
    for (const entity of messageEntities) {
      if (entity.body.role === 'tool' && entity.body.toolCallId) {
        answeredToolCallIds.add(entity.body.toolCallId)
      }
    }

    const chatMessages = this.resolveChatEntity(chatEntity.id, chatEntity.uuid)?.messages || chatEntity.messages || []
    for (const messageId of chatMessages) {
      const entity = chatDb.getMessageById(messageId)
      if (entity?.body.role === 'tool' && entity.body.toolCallId) {
        answeredToolCallIds.add(entity.body.toolCallId)
      }
    }

    return toolCalls.some((toolCall) => !answeredToolCallIds.has(toolCall.id))
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

    const latestChat = this.resolveChatEntity(chatEntity.id, chatEntity.uuid) ?? chatEntity
    const messages = latestChat.messages || []
    const nextMessages = messages.includes(messageId)
      ? messages
      : [...messages, messageId]

    chatDb.updateChat({
      ...latestChat,
      messages: nextMessages,
      updateTime: Date.now()
    })
  }

  private resolveChatEntity(chatId?: number, chatUuid?: string): ChatEntity | undefined {
    if (chatId != null) {
      const chat = chatDb.getChatById(chatId)
      if (chat) {
        return chat
      }
    }

    if (chatUuid) {
      return chatDb.getChatByUuid(chatUuid)
    }

    return undefined
  }
}
