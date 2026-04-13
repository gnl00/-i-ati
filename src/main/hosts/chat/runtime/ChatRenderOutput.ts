import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type { StepArtifact } from '@main/agent/contracts'
import type { AgentRenderMessageState } from '@main/hosts/shared/render'
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

export class ChatRenderOutput {
  readonly messageEvents: ChatEventMapper
  private readonly mapper: ChatRenderMapper
  private readonly artifacts: StepArtifact[] = []
  private finalAssistantMessage: MessageEntity

  constructor(
    emitter: import('@main/orchestration/chat/run/infrastructure').RunEventEmitter,
    private readonly messageEntities: MessageEntity[],
    assistantPlaceholder: MessageEntity,
    private readonly stepStore = new ChatStepStore(),
    mapper = new ChatRenderMapper()
  ) {
    this.messageEvents = new ChatEventMapper(emitter)
    this.mapper = mapper
    this.finalAssistantMessage = {
      ...assistantPlaceholder,
      body: {
        ...assistantPlaceholder.body
      }
    }
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.finalAssistantMessage
  }

  getArtifacts(): StepArtifact[] {
    return [...this.artifacts]
  }

  getCommittedTypewriterCompleted(): boolean {
    return Boolean(this.finalAssistantMessage.body.typewriterCompleted)
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
      baseBody: this.finalAssistantMessage.body
    })

    this.messageEvents.emitStreamPreviewUpdated({
      chatId: this.finalAssistantMessage.chatId,
      chatUuid: this.finalAssistantMessage.chatUuid,
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
        chatId: this.finalAssistantMessage.chatId,
        chatUuid: this.finalAssistantMessage.chatUuid
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
        chatId: this.finalAssistantMessage.chatId,
        chatUuid: this.finalAssistantMessage.chatUuid
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
      baseBody: this.finalAssistantMessage.body,
      typewriterCompleted
    })
  }

  commitAssistantMessage(body: ChatMessage): void {
    this.finalAssistantMessage = {
      ...this.finalAssistantMessage,
      body
    }
    assertMessageEntitySegmentsHaveIds(this.finalAssistantMessage, 'next-agent-ui-adapter:message-commit')

    const index = this.messageEntities.findIndex(message => message.id === this.finalAssistantMessage.id)
    if (index >= 0) {
      this.messageEntities[index] = this.finalAssistantMessage
    }

    this.artifacts.push({
      kind: 'assistant_message_updated',
      messageId: this.finalAssistantMessage.id,
      role: 'assistant',
      content: typeof body.content === 'string' ? body.content : '',
      segments: body.segments || [],
      toolCalls: body.toolCalls
    })

    if (!this.finalAssistantMessage.id || !body.segments?.length) {
      this.messageEvents.emitMessageUpdated(this.finalAssistantMessage)
      return
    }

    body.segments.forEach((segment, index) => {
      this.messageEvents.emitMessageSegmentUpdated(this.finalAssistantMessage.id!, {
        segment,
        ...(index === 0 ? { replaceSegments: body.segments } : {}),
        ...(index === 0
          ? {
              content: body.content,
              toolCalls: body.toolCalls,
              typewriterCompleted: body.typewriterCompleted
            }
          : {})
      })
    })
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
      this.finalAssistantMessage.chatId,
      this.finalAssistantMessage.chatUuid
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
