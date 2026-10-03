import { chatDb } from '@main/db/chat'
import { parseImageShowResult, isImageDisplayTool } from '@shared/tools/image/types'
import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import {
  projectToolResultContentForDisplay,
  type ToolResultFact
} from '@main/agent/contracts/HostRuntimeContracts'
import type { AgentRenderMessageState } from '@main/hosts/shared/render'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import { ChatRenderMapper } from './ChatRenderMapper'

const hasPersistableAssistantPayload = (body: ChatMessage): boolean => {
  const hasContent =
    typeof body.content === 'string'
      ? body.content.trim().length > 0
      : Array.isArray(body.content) && body.content.length > 0

  const hasSegments = Array.isArray(body.segments) && body.segments.length > 0
  const hasToolCalls = Array.isArray(body.toolCalls) && body.toolCalls.length > 0

  return hasContent || hasSegments || hasToolCalls
}

export class ChatRenderOutput {
  readonly messageEvents: ChatEventMapper
  private readonly mapper: ChatRenderMapper

  constructor(
    emitter: import('@main/agent/contracts').RunEventEmitter,
    private readonly messageEntities: MessageEntity[],
    private assistantDraft: MessageEntity,
    private readonly stepStore = new ChatStepStore(),
    mapper = new ChatRenderMapper()
  ) {
    this.messageEvents = new ChatEventMapper(emitter)
    this.mapper = mapper
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.assistantDraft
  }

  getCommittedTypewriterCompleted(): boolean {
    return Boolean(this.assistantDraft.body.typewriterCompleted)
  }

  clearPreview(): void {
    this.messageEvents.emitStreamPreviewCleared()
  }

  emitPreview(state: AgentRenderMessageState | null, timestamp: number): void {
    if (!state) {
      this.messageEvents.emitStreamPreviewCleared()
      return
    }

    const previewBody = this.mapper.buildPreviewBody({
      state,
      timestamp,
      baseBody: this.assistantDraft.body
    })

    this.messageEvents.emitStreamPreviewUpdated({
      chatId: this.assistantDraft.chatId,
      chatUuid: this.assistantDraft.chatUuid,
      body: previewBody
    } satisfies MessageEntity)
  }

  emitPreviewTextPatch(state: AgentRenderMessageState | null): boolean {
    if (!state) {
      return false
    }

    const patch = this.mapper.buildPreviewTextPatch(state)
    if (!patch) {
      return false
    }

    this.messageEvents.emitStreamPreviewSegmentUpdated(
      {
        chatId: this.assistantDraft.chatId,
        chatUuid: this.assistantDraft.chatUuid
      },
      patch
    )
    return true
  }

  emitPreviewReasoningPatch(state: AgentRenderMessageState | null): boolean {
    if (!state) {
      return false
    }

    const patch = this.mapper.buildPreviewReasoningPatch(state)
    if (!patch) {
      return false
    }

    this.messageEvents.emitStreamPreviewSegmentUpdated(
      {
        chatId: this.assistantDraft.chatId,
        chatUuid: this.assistantDraft.chatUuid
      },
      patch
    )
    return true
  }

  buildCommittedBody(
    state: AgentRenderMessageState,
    timestamp: number,
    typewriterCompleted = false
  ): ChatMessage {
    return this.mapper.buildCommittedBody({
      state,
      timestamp,
      baseBody: this.assistantDraft.body,
      typewriterCompleted
    })
  }

  commitAssistantMessage(body: ChatMessage): void {
    this.assistantDraft.body = body
    const message = this.assistantDraft
    assertMessageEntitySegmentsHaveIds(message, 'next-agent-ui-adapter:message-commit')

    if (message.id == null && hasPersistableAssistantPayload(message.body)) {
      const persistedMessage = this.stepStore.persistAssistantMessage(message)
      this.messageEntities.push(persistedMessage)
      this.messageEvents.emitMessageCreated(persistedMessage)
      return
    }

    if (message.id != null) {
      const persistedMessage = this.stepStore.persistAssistantMessage(message)
      this.messageEvents.emitMessageUpdated(persistedMessage)
      return
    }

    this.messageEvents.emitStreamPreviewUpdated({
      chatId: message.chatId,
      chatUuid: message.chatUuid,
      body: {
        ...message.body,
        source: MESSAGE_SOURCE.STREAM_PREVIEW,
        typewriterCompleted: false
      }
    } satisfies MessageEntity)
  }

  async appendToolResult(result: ToolResultFact): Promise<string> {
    if (isImageDisplayTool(result.toolName)) {
      const existing = this.messageEntities.find(message => message.body.role === 'tool'
        && message.body.name === result.toolName && message.body.toolCallId === result.toolCallId)
      if (existing) return projectToolResultContentForDisplay({ content: existing.body.content })
    }
    const rawContent = projectToolResultContentForDisplay({
      content: result.content,
      error: result.error,
      failure: result.failure
    })
    const toolMessage: ChatMessage = {
      role: 'tool',
      name: result.toolName,
      toolCallId: result.toolCallId,
      content: rawContent,
      toolResultModelContent: result.modelContent,
      toolResultModelContentKind: result.modelContentKind,
      segments: []
    }

    const entity = this.stepStore.persistToolResultMessage(
      toolMessage,
      this.assistantDraft.chatId,
      this.assistantDraft.chatUuid
    )
    this.messageEntities.push(entity)

    this.messageEvents.emitToolResultAttached(result.toolCallId, entity)
    if (isImageDisplayTool(result.toolName) && parseImageShowResult(result.content)) {
      this.messageEvents.emitMessageCreated(entity)
    }

    return rawContent
  }

  updateToolResult(toolCallId: string, content: unknown): boolean {
    const entity = this.messageEntities.find(message => message.body.role === 'tool'
      && isImageDisplayTool(message.body.name) && message.body.toolCallId === toolCallId)
    const previous = parseImageShowResult(entity?.body.content)
    const next = parseImageShowResult(content)
    if (!entity || entity.id == null || !previous || !next || previous.image.assetId !== next.image.assetId) {
      throw new Error('Image delivery receipt has no matching persisted tool result.')
    }
    if (next.telegram?.state === 'sending' && previous.telegram) return false
    if (previous.telegram && previous.telegram.state !== 'sending') return false
    entity.body = { ...entity.body, content: JSON.stringify(next) }
    this.stepStore.persistAssistantMessage(entity)
    this.messageEvents.emitMessageUpdated(entity)
    const delivery = next.telegram
    if (delivery?.state === 'sent' && delivery.botId && delivery.messageId !== undefined
      && entity.chatId !== undefined && entity.chatUuid) {
      try {
        chatDb.saveTelegramReceipt({ chatId: entity.chatId, chatUuid: entity.chatUuid,
          botId: delivery.botId, hostChatId: delivery.chatId, hostThreadId: delivery.threadId },
        String(delivery.messageId), entity.id)
      } catch {
        // The upload succeeded. A reply-routing write failure must not repeat it.
        console.warn('[ImageDisplay] Failed to save Telegram reply routing receipt.')
      }
    }
    return true
  }

  consumeSteeringMessage(input: { text: string; imageUrls: string[]; textAttachments?: TextAttachment[] }): MessageEntity {
    if (this.assistantDraft.id != null) {
      this.assistantDraft.body = {
        ...this.assistantDraft.body,
        typewriterCompleted: true
      }
      const settledAssistant = this.stepStore.persistAssistantMessage(this.assistantDraft)
      this.messageEvents.emitMessageUpdated(settledAssistant)
    }

    const userMessage = this.stepStore.persistSteeringUserMessage(
      input,
      this.assistantDraft.chatId,
      this.assistantDraft.chatUuid
    )
    this.messageEntities.push(userMessage)
    this.messageEvents.emitMessageCreated(userMessage)

    const previousBody = this.assistantDraft.body
    this.assistantDraft = {
      chatId: this.assistantDraft.chatId,
      chatUuid: this.assistantDraft.chatUuid,
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        createdAt: Date.now(),
        typewriterCompleted: false,
        ...(previousBody.model ? { model: previousBody.model } : {}),
        ...(previousBody.modelRef ? { modelRef: previousBody.modelRef } : {}),
        ...(previousBody.source ? { source: previousBody.source } : {}),
        ...(previousBody.host ? { host: previousBody.host } : {})
      }
    }
    return userMessage
  }
}
