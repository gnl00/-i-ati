import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type { StepArtifact } from '@main/agent/contracts'
import {
  CommittedAssistantMessageController,
  type AgentRenderMessageState
} from '@main/hosts/shared/render'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import { ChatRenderMapper } from './ChatRenderMapper'

const stringifyToolContent = (content: unknown, error?: { message?: string }): string => {
  if (typeof content === 'string') {
    return content
  }
  if (content == null) {
    return error?.message || ''
  }
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

const hasPersistableAssistantPayload = (body: ChatMessage): boolean => {
  const hasContent = typeof body.content === 'string'
    ? body.content.trim().length > 0
    : Array.isArray(body.content) && body.content.length > 0

  const hasSegments = Array.isArray(body.segments) && body.segments.length > 0
  const hasToolCalls = Array.isArray(body.toolCalls) && body.toolCalls.length > 0

  return hasContent || hasSegments || hasToolCalls
}

export class ChatRenderOutput {
  readonly messageEvents: ChatEventMapper
  private readonly mapper: ChatRenderMapper
  private readonly artifacts: StepArtifact[] = []
  private readonly committedAssistant: CommittedAssistantMessageController

  constructor(
    emitter: import('@main/orchestration/chat/run/infrastructure').RunEventEmitter,
    private readonly messageEntities: MessageEntity[],
    assistantDraft: MessageEntity,
    private readonly stepStore = new ChatStepStore(),
    mapper = new ChatRenderMapper()
  ) {
    this.messageEvents = new ChatEventMapper(emitter)
    this.mapper = mapper
    this.committedAssistant = new CommittedAssistantMessageController(
      assistantDraft,
      this.messageEntities
    )
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.committedAssistant.getFinalAssistantMessage()
  }

  getArtifacts(): StepArtifact[] {
    return [...this.artifacts]
  }

  getCommittedTypewriterCompleted(): boolean {
    return this.committedAssistant.getCommittedTypewriterCompleted()
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
      baseBody: this.committedAssistant.getFinalAssistantMessage().body
    })

    this.messageEvents.emitStreamPreviewUpdated({
      chatId: this.committedAssistant.getFinalAssistantMessage().chatId,
      chatUuid: this.committedAssistant.getFinalAssistantMessage().chatUuid,
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
        chatId: this.committedAssistant.getFinalAssistantMessage().chatId,
        chatUuid: this.committedAssistant.getFinalAssistantMessage().chatUuid
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
        chatId: this.committedAssistant.getFinalAssistantMessage().chatId,
        chatUuid: this.committedAssistant.getFinalAssistantMessage().chatUuid
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
      baseBody: this.committedAssistant.getFinalAssistantMessage().body,
      typewriterCompleted
    })
  }

  commitAssistantMessage(body: ChatMessage): void {
    const { message, artifact } = this.committedAssistant.commit(body)
    assertMessageEntitySegmentsHaveIds(message, 'next-agent-ui-adapter:message-commit')
    this.artifacts.push(artifact)

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
        source: 'stream_preview',
        typewriterCompleted: false
      }
    } satisfies MessageEntity)
  }

  appendToolResult(result: ToolResultFact): void {
    const toolMessage: ChatMessage = {
      role: 'tool',
      name: result.toolName,
      toolCallId: result.toolCallId,
      content: stringifyToolContent(result.content, result.error),
      segments: []
    }

    const entity = this.stepStore.persistToolResultMessage(
      toolMessage,
      this.committedAssistant.getFinalAssistantMessage().chatId,
      this.committedAssistant.getFinalAssistantMessage().chatUuid
    )
    this.messageEntities.push(entity)
    this.artifacts.push({
      kind: 'tool_result_created',
      toolCallId: result.toolCallId,
      messageId: entity.id,
      message: entity.body
    })
    this.messageEvents.emitToolResultAttached(result.toolCallId, entity)
  }
}
