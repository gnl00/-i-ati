import { RUN_LIFECYCLE_EVENTS, RUN_STATES } from '@shared/run/lifecycle-events'
import { RUN_OUTPUT_EVENTS } from '@shared/run/output-events'
import { assertMessageEntitySegmentsHaveIds } from '@shared/chat/segmentId'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import type { StepArtifact } from '@main/agent/contracts'
import { serializeError } from '@main/utils/serializeError'
import type {
  AgentUiMessageState,
  AgentUiReasoningBlockState,
  AgentUiTextBlockState,
  AgentUiToolCallState
} from './AgentUiState'
import { AgentUiStateReducer } from './AgentUiStateReducer'

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

const toDetectedToolCall = (toolCall: IToolCall) => ({
  id: toolCall.id,
  name: toolCall.function.name,
  args: toolCall.function.arguments,
  status: 'pending' as const,
  index: toolCall.index
})

const toMessageToolCall = (toolCall: AgentUiToolCallState): IToolCall => ({
  id: toolCall.toolCallId,
  index: toolCall.toolCallIndex,
  type: 'function',
  function: {
    name: toolCall.name,
    arguments: toolCall.args || ''
  }
})

const buildReasoningSegment = (
  block: AgentUiReasoningBlockState,
  timestamp: number,
  layer: 'preview' | 'committed'
): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: `${layer}:${block.stepId}:reasoning`,
  content: block.content,
  timestamp
})

const buildTextSegment = (
  block: AgentUiTextBlockState,
  timestamp: number,
  layer: 'preview' | 'committed'
): TextSegment => ({
  type: 'text',
  segmentId: `${layer}:${block.stepId}:text`,
  content: block.content,
  timestamp
})

const buildSegments = (input: {
  state: AgentUiMessageState
  timestamp: number
  includeText: boolean
  layer: 'preview' | 'committed'
}): MessageSegment[] => {
  const segments: MessageSegment[] = []
  const toolCallMap = new Map(
    input.state.toolCalls.map((call) => [call.toolCallId, call] as const)
  )

  for (const block of input.state.contentBlocks) {
    if (block.kind === 'reasoning') {
      if (block.content.trim()) {
        segments.push(buildReasoningSegment(block, input.timestamp, input.layer))
      }
      continue
    }

    if (block.kind === 'text') {
      if (input.includeText && block.content.trim()) {
        segments.push(buildTextSegment(block, input.timestamp, input.layer))
      }
      continue
    }

    const call = toolCallMap.get(block.toolCallId)
    if (!call) {
      continue
    }
    segments.push({
      type: 'toolCall',
      segmentId: `${input.layer}:${block.stepId}:tool:${call.toolCallId}`,
      name: call.name,
      content: {
        toolName: call.name,
        args: call.args,
        status: call.status,
        ...(call.result !== undefined ? { result: call.result } : {}),
        ...(call.error ? { error: call.error } : {})
      },
      ...(call.cost !== undefined ? { cost: call.cost } : {}),
      isError: call.status === 'failed' || call.status === 'aborted',
      timestamp: input.timestamp,
      toolCallId: call.toolCallId,
      toolCallIndex: call.toolCallIndex
    })
  }

  if (input.state.failure) {
    const failure = input.state.failure
    segments.push({
      type: 'error',
      segmentId: `${input.layer}:${input.state.stepId || 'unknown-step'}:error`,
      error: {
        name: 'name' in failure && failure.name ? failure.name : 'Error',
        message: failure.message,
        code: 'code' in failure ? failure.code : undefined,
        timestamp: input.timestamp
      }
    })
  }

  return segments
}

export class AgentUiAdapter implements AgentEventSink {
  private readonly messageEvents: ChatEventMapper
  private readonly artifacts: StepArtifact[] = []
  private finalAssistantMessage: MessageEntity
  private readonly reducer = new AgentUiStateReducer()
  private lastUsage?: ITokenUsage

  constructor(
    private readonly emitter: import('@main/orchestration/chat/run/infrastructure').RunEventEmitter,
    private readonly messageEntities: MessageEntity[],
    assistantPlaceholder: MessageEntity,
    private readonly stepStore = new ChatStepStore()
  ) {
    this.messageEvents = new ChatEventMapper(emitter)
    this.finalAssistantMessage = {
      ...assistantPlaceholder,
      body: {
        ...assistantPlaceholder.body
      }
    }
  }

  async handle(event: AgentEvent): Promise<void> {
    const previousState = this.reducer.snapshot()
    const state = this.reducer.apply(event)
    this.lastUsage = state.lastUsage ?? this.lastUsage

    switch (event.type) {
      case 'step.started':
        this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: RUN_STATES.STREAMING })
        return
      case 'step.delta':
        if (event.delta.type === 'tool_call_ready') {
          this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_CALL_DETECTED, {
            toolCall: toDetectedToolCall(event.delta.toolCall)
          })
        }
        const hasActivePreview = Boolean(
          previousState.preview
          && state.preview
          && previousState.preview.stepId === state.preview.stepId
        )
        if (event.delta.type === 'content_delta' && hasActivePreview) {
          if (this.emitPreviewTextPatch(state.preview, event.timestamp)) {
            return
          }
        }
        if (event.delta.type === 'reasoning_delta' && hasActivePreview) {
          if (this.emitPreviewReasoningPatch(state.preview, event.timestamp)) {
            return
          }
        }
        this.emitPreview(state.preview, event.timestamp)
        return
      case 'step.completed':
        this.messageEvents.emitStreamPreviewCleared()
        this.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          Boolean(previousState.preview)
        ))
        return
      case 'step.failed':
        this.messageEvents.emitStreamPreviewCleared()
        this.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          Boolean(previousState.preview)
        ))
        return
      case 'step.aborted':
        this.messageEvents.emitStreamPreviewCleared()
        this.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          Boolean(previousState.preview)
        ))
        return
      case 'tool.awaiting_confirmation':
        this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_CONFIRMATION_REQUIRED, {
          toolCallId: event.toolCallId,
          name: event.toolName
        })
        return
      case 'tool.confirmation_denied':
        this.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          this.getCommittedTypewriterCompleted()
        ))
        await this.handleToolResult(event.deniedResult)
        return
      case 'tool.execution_progress':
        await this.handleToolProgress(event, state.committed)
        return
      case 'loop.failed':
      case 'loop.aborted':
      case 'loop.completed':
        this.messageEvents.emitStreamPreviewCleared()
        return
    }
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.finalAssistantMessage
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.lastUsage
  }

  getArtifacts(): StepArtifact[] {
    return [...this.artifacts]
  }

  private emitPreview(state: AgentUiMessageState | null, timestamp: number): void {
    if (!state) {
      this.messageEvents.emitStreamPreviewCleared()
      return
    }

    const previewBody: ChatMessage = {
      ...this.finalAssistantMessage.body,
      source: 'stream_preview',
      content: state.content,
      segments: buildSegments({
        state,
        timestamp,
        includeText: true,
        layer: 'preview'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map(toMessageToolCall)
        : undefined,
      typewriterCompleted: false
    }

    this.messageEvents.emitStreamPreviewUpdated({
      chatId: this.finalAssistantMessage.chatId,
      chatUuid: this.finalAssistantMessage.chatUuid,
      body: previewBody
    } satisfies MessageEntity)
  }

  private emitPreviewTextPatch(state: AgentUiMessageState | null, timestamp: number): boolean {
    if (!state) {
      return false
    }

    const textBlock = state.contentBlocks.findLast(
      (block): block is AgentUiTextBlockState => block.kind === 'text' && block.content.trim().length > 0
    )
    if (!textBlock) {
      return false
    }
    const segment = buildTextSegment(textBlock, timestamp, 'preview')

    this.messageEvents.emitStreamPreviewSegmentUpdated(
      {
        chatId: this.finalAssistantMessage.chatId,
        chatUuid: this.finalAssistantMessage.chatUuid
      },
      {
        segment,
        content: state.content,
        toolCalls: state.toolCalls.length > 0
          ? state.toolCalls.map(toMessageToolCall)
          : undefined,
        typewriterCompleted: false
      }
    )
    return true
  }

  private emitPreviewReasoningPatch(state: AgentUiMessageState | null, timestamp: number): boolean {
    if (!state) {
      return false
    }

    const reasoningBlock = state.contentBlocks.findLast(
      (block): block is AgentUiReasoningBlockState => block.kind === 'reasoning' && block.content.trim().length > 0
    )
    if (!reasoningBlock) {
      return false
    }
    const segment = buildReasoningSegment(reasoningBlock, timestamp, 'preview')

    this.messageEvents.emitStreamPreviewSegmentUpdated(
      {
        chatId: this.finalAssistantMessage.chatId,
        chatUuid: this.finalAssistantMessage.chatUuid
      },
      {
        segment,
        toolCalls: state.toolCalls.length > 0
          ? state.toolCalls.map(toMessageToolCall)
          : undefined,
        typewriterCompleted: false
      }
    )
    return true
  }

  private async handleToolProgress(
    event: Extract<AgentEvent, { type: 'tool.execution_progress' }>,
    committedState: AgentUiMessageState
  ): Promise<void> {
    if (event.phase === 'started') {
      this.commitAssistantMessage(this.buildBody(
        committedState,
        event.timestamp,
        this.getCommittedTypewriterCompleted()
      ))
      this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: RUN_STATES.EXECUTING_TOOLS })
      this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_EXECUTION_STARTED, {
        toolCallId: event.toolCallId,
        name: event.toolName
      })
      return
    }

    this.commitAssistantMessage(this.buildBody(
      committedState,
      event.timestamp,
      this.getCommittedTypewriterCompleted()
    ))

    if (event.phase === 'completed') {
      this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_EXECUTION_COMPLETED, {
        toolCallId: event.result.toolCallId,
        result: event.result.content,
        cost: event.result.cost ?? 0
      })
      await this.handleToolResult(event.result)
      return
    }

    this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_EXECUTION_FAILED, {
      toolCallId: event.result.toolCallId,
      error: serializeError(new Error(event.result.error?.message || (
        event.phase === 'failed' ? 'Tool execution failed' : 'Tool execution aborted'
      )))
    })
    await this.handleToolResult(event.result)
  }

  private async handleToolResult(result: ToolResultFact): Promise<void> {
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

  private buildBody(
    state: AgentUiMessageState,
    timestamp: number,
    typewriterCompleted = false
  ): ChatMessage {
    return {
      ...this.finalAssistantMessage.body,
      content: state.content,
      segments: buildSegments({
        state,
        timestamp,
        includeText: Boolean(state.content.trim()),
        layer: 'committed'
      }),
      toolCalls: state.toolCalls.length > 0
        ? state.toolCalls.map(toMessageToolCall)
        : undefined,
      typewriterCompleted
    }
  }

  private getCommittedTypewriterCompleted(): boolean {
    return Boolean(this.finalAssistantMessage.body.typewriterCompleted)
  }

  private commitAssistantMessage(body: ChatMessage): void {
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
}
