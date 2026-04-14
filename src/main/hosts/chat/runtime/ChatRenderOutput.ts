import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type { StepArtifact } from '@main/agent/contracts'
import type { AgentRenderMessageState } from '@main/hosts/shared/render'
import type { MessageSegmentPatch } from '@shared/run/output-events'
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

const getSegmentIdentity = (segment: MessageSegment, index: number): string => {
  if (segment.segmentId) return segment.segmentId
  if (segment.type === 'toolCall' && segment.toolCallId) return `tool:${segment.toolCallId}`
  if (segment.type === 'error') return `error:${segment.error.timestamp}:${index}`
  return `${segment.type}:${('timestamp' in segment && typeof segment.timestamp === 'number') ? segment.timestamp : index}`
}

const areSegmentsEquivalent = (previous: MessageSegment, next: MessageSegment): boolean => {
  if (previous.type !== next.type) return false
  if (previous.segmentId && next.segmentId && previous.segmentId !== next.segmentId) return false

  switch (next.type) {
    case 'text':
      return previous.type === 'text'
        && previous.content === next.content
        && previous.timestamp === next.timestamp
        && previous.segmentId === next.segmentId
    case 'reasoning':
      return previous.type === 'reasoning'
        && previous.content === next.content
        && previous.timestamp === next.timestamp
        && previous.segmentId === next.segmentId
        && previous.endedAt === next.endedAt
    case 'toolCall':
      return previous.type === 'toolCall'
        && previous.segmentId === next.segmentId
        && previous.name === next.name
        && previous.toolCallId === next.toolCallId
        && previous.toolCallIndex === next.toolCallIndex
        && previous.timestamp === next.timestamp
        && previous.cost === next.cost
        && previous.isError === next.isError
        && previous.content?.status === next.content?.status
        && previous.content?.args === next.content?.args
        && previous.content?.error === next.content?.error
        && previous.content?.result === next.content?.result
        && previous.content?.raw === next.content?.raw
    case 'error':
      return previous.type === 'error'
        && previous.segmentId === next.segmentId
        && previous.error.timestamp === next.error.timestamp
        && previous.error.name === next.error.name
        && previous.error.message === next.error.message
        && previous.error.code === next.error.code
        && previous.error.stack === next.error.stack
    default:
      return false
  }
}

const hasSameSegmentStructure = (
  previous: MessageSegment[],
  next: MessageSegment[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((segment, index) => (
    getSegmentIdentity(segment, index) === getSegmentIdentity(next[index], index)
  ))
}

const areToolCallsEquivalent = (
  previous: IToolCall[] | undefined,
  next: IToolCall[] | undefined
): boolean => {
  if (previous === next) return true
  if (!previous?.length && !next?.length) return true
  if (!previous || !next || previous.length !== next.length) return false

  return previous.every((toolCall, index) => {
    const nextToolCall = next[index]
    return toolCall.id === nextToolCall.id
      && toolCall.index === nextToolCall.index
      && toolCall.type === nextToolCall.type
      && toolCall.function?.name === nextToolCall.function?.name
      && toolCall.function?.arguments === nextToolCall.function?.arguments
  })
}

const buildDifferentialSegmentPatches = (
  previousBody: ChatMessage,
  nextBody: ChatMessage
): MessageSegmentPatch[] => {
  const previousSegments = previousBody.segments ?? []
  const nextSegments = nextBody.segments ?? []

  if (!hasSameSegmentStructure(previousSegments, nextSegments)) {
    return nextSegments.map((segment, index) => ({
      segment,
      ...(index === 0 ? { replaceSegments: nextSegments } : {}),
      ...(index === 0
        ? {
            content: nextBody.content,
            toolCalls: nextBody.toolCalls,
            typewriterCompleted: nextBody.typewriterCompleted
          }
        : {})
    }))
  }

  const changedIndices = nextSegments
    .map((segment, index) => (
      areSegmentsEquivalent(previousSegments[index], segment) ? -1 : index
    ))
    .filter((index) => index >= 0)

  if (changedIndices.length === 0) {
    if (
      previousBody.content === nextBody.content
      && areToolCallsEquivalent(previousBody.toolCalls, nextBody.toolCalls)
      && previousBody.typewriterCompleted === nextBody.typewriterCompleted
    ) {
      return []
    }

    const fallbackSegment = nextSegments[0]
    return fallbackSegment
      ? [{
          segment: fallbackSegment,
          content: nextBody.content,
          toolCalls: nextBody.toolCalls,
          typewriterCompleted: nextBody.typewriterCompleted
        }]
      : []
  }

  return changedIndices.map((index, patchIndex) => ({
    segment: nextSegments[index],
    ...(patchIndex === 0
      ? {
          content: nextBody.content,
          toolCalls: nextBody.toolCalls,
          typewriterCompleted: nextBody.typewriterCompleted
        }
      : {})
  }))
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
    const previousBody = this.finalAssistantMessage.body
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

    const patches = buildDifferentialSegmentPatches(previousBody, body)
    if (patches.length === 0) {
      return
    }

    patches.forEach((patch) => {
      this.messageEvents.emitMessageSegmentUpdated(this.finalAssistantMessage.id!, patch)
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
