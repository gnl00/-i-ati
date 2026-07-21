import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import { projectToolResultContentForDisplay } from '@main/agent/runtime/tools/ToolResultContentProjector'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { createLogger } from '@main/logging/LogService'
import type { AgentRenderMessageState } from '@main/hosts/shared/render'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import { ChatRenderMapper } from './ChatRenderMapper'
import type { ToolResultCompactionTrigger } from './ToolResultCompactionTrigger'

const logger = createLogger('ChatRenderOutput')

const hasPersistableAssistantPayload = (body: ChatMessage): boolean => {
  const hasContent = typeof body.content === 'string'
    ? body.content.trim().length > 0
    : Array.isArray(body.content) && body.content.length > 0

  const hasSegments = Array.isArray(body.segments) && body.segments.length > 0
  const hasToolCalls = Array.isArray(body.toolCalls) && body.toolCalls.length > 0

  return hasContent || hasSegments || hasToolCalls
}

const parseToolCallArguments = (rawArguments: string | undefined): unknown => {
  if (!rawArguments) {
    return undefined
  }

  try {
    return JSON.parse(rawArguments)
  } catch {
    return rawArguments
  }
}

export class ChatRenderOutput {
  readonly messageEvents: ChatEventMapper
  private readonly mapper: ChatRenderMapper

  constructor(
    emitter: import('@main/agent/contracts').RunEventEmitter,
    private readonly messageEntities: MessageEntity[],
    private readonly assistantDraft: MessageEntity,
    private readonly stepStore = new ChatStepStore(),
    mapper = new ChatRenderMapper(),
    private readonly toolResultCompactionTrigger: ToolResultCompactionTrigger,
    private readonly signal?: AbortSignal
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
    const rawContent = projectToolResultContentForDisplay({
      content: result.content,
      error: result.error
    })
    const toolMessage: ChatMessage = {
      role: 'tool',
      name: result.toolName,
      toolCallId: result.toolCallId,
      content: rawContent,
      segments: []
    }

    const entity = this.stepStore.persistToolResultMessage(
      toolMessage,
      this.assistantDraft.chatId,
      this.assistantDraft.chatUuid
    )
    this.messageEntities.push(entity)

    this.messageEvents.emitToolResultAttached(result.toolCallId, entity)

    if (entity.id != null) {
      const toolCall = this.assistantDraft.body.toolCalls
        ?.find(candidate => candidate.id === result.toolCallId)
      try {
        this.toolResultCompactionTrigger.schedule({
          messageId: entity.id,
          result,
          rawContent,
          args: parseToolCallArguments(toolCall?.function.arguments),
          signal: this.signal
        })
      } catch (error) {
        logger.warn('tool_result.compaction.schedule_failed', {
          messageId: entity.id,
          toolName: result.toolName,
          toolCallId: result.toolCallId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    return rawContent
  }
}
