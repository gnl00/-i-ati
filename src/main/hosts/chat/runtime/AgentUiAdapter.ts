import { RUN_LIFECYCLE_EVENTS, RUN_STATES } from '@shared/run/lifecycle-events'
import { RUN_OUTPUT_EVENTS } from '@shared/run/output-events'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import type { StepArtifact } from '@main/agent/contracts'
import {
  AgentRenderStateReducer,
  type AgentRenderMessageState
} from '@main/hosts/shared/render'
import { serializeError } from '@main/utils/serializeError'
import { ChatRenderMapper } from './ChatRenderMapper'
import { ChatRenderOutput } from './ChatRenderOutput'

const toDetectedToolCall = (toolCall: IToolCall) => ({
  id: toolCall.id,
  name: toolCall.function.name,
  args: toolCall.function.arguments,
  status: 'pending' as const,
  index: toolCall.index
})

export class AgentUiAdapter implements AgentEventSink {
  private readonly reducer = new AgentRenderStateReducer()
  private readonly mapper = new ChatRenderMapper()
  private readonly output: ChatRenderOutput
  private lastUsage?: ITokenUsage

  constructor(
    private readonly emitter: import('@main/orchestration/chat/run/infrastructure').RunEventEmitter,
    messageEntities: MessageEntity[],
    assistantPlaceholder: MessageEntity,
    stepStore = new ChatStepStore()
  ) {
    this.output = new ChatRenderOutput(
      emitter,
      messageEntities,
      assistantPlaceholder,
      stepStore,
      this.mapper
    )
  }

  get messageEvents(): ChatEventMapper {
    return this.output.messageEvents
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

        if (this.shouldEmitPreviewTextPatch(event, previousState.preview, state.preview)) {
          this.emitPreviewTextPatch(state.preview)
          return
        }

        if (this.shouldEmitPreviewReasoningPatch(event, previousState.preview, state.preview)) {
          this.emitPreviewReasoningPatch(state.preview)
          return
        }

        this.emitPreview(state.preview, event.timestamp)
        return
      case 'step.completed':
        this.output.clearPreview()
        this.output.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          Boolean(previousState.preview)
        ))
        return
      case 'step.failed':
        this.output.clearPreview()
        this.output.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          Boolean(previousState.preview)
        ))
        return
      case 'step.aborted':
        this.output.clearPreview()
        this.output.commitAssistantMessage(this.buildBody(
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
        this.output.commitAssistantMessage(this.buildBody(
          state.committed,
          event.timestamp,
          this.output.getCommittedTypewriterCompleted()
        ))
        await this.handleToolResult(event.deniedResult)
        return
      case 'tool.execution_progress':
        await this.handleToolProgress(event, state.committed)
        return
      case 'loop.failed':
      case 'loop.aborted':
      case 'loop.completed':
        this.output.clearPreview()
        return
    }
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.output.getFinalAssistantMessage()
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.lastUsage
  }

  getArtifacts(): StepArtifact[] {
    return this.output.getArtifacts()
  }

  private shouldEmitPreviewTextPatch(
    event: Extract<AgentEvent, { type: 'step.delta' }>,
    previousPreview: AgentRenderMessageState | null,
    nextPreview: AgentRenderMessageState | null
  ): boolean {
    return event.delta.type === 'content_delta'
      && Boolean(previousPreview && nextPreview && previousPreview.stepId === nextPreview.stepId)
      && this.mapper.canEmitOptimizedTextPreviewPatch(previousPreview!, nextPreview!)
  }

  private shouldEmitPreviewReasoningPatch(
    event: Extract<AgentEvent, { type: 'step.delta' }>,
    previousPreview: AgentRenderMessageState | null,
    nextPreview: AgentRenderMessageState | null
  ): boolean {
    return event.delta.type === 'reasoning_delta'
      && Boolean(previousPreview && nextPreview && previousPreview.stepId === nextPreview.stepId)
      && this.mapper.canEmitOptimizedReasoningPreviewPatch(previousPreview!, nextPreview!)
  }

  private emitPreview(state: AgentRenderMessageState | null, timestamp: number): void {
    this.output.emitPreview(state, timestamp)
  }

  private emitPreviewTextPatch(state: AgentRenderMessageState | null): boolean {
    return this.output.emitPreviewTextPatch(state)
  }

  private emitPreviewReasoningPatch(state: AgentRenderMessageState | null): boolean {
    return this.output.emitPreviewReasoningPatch(state)
  }

  private async handleToolProgress(
    event: Extract<AgentEvent, { type: 'tool.execution_progress' }>,
    committedState: AgentRenderMessageState
  ): Promise<void> {
    if (event.phase === 'started') {
      this.output.commitAssistantMessage(this.buildBody(
        committedState,
        event.timestamp,
        this.output.getCommittedTypewriterCompleted()
      ))
      this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: RUN_STATES.EXECUTING_TOOLS })
      this.emitter.emit(RUN_OUTPUT_EVENTS.TOOL_EXECUTION_STARTED, {
        toolCallId: event.toolCallId,
        name: event.toolName
      })
      return
    }

    this.output.commitAssistantMessage(this.buildBody(
      committedState,
      event.timestamp,
      this.output.getCommittedTypewriterCompleted()
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
    this.output.appendToolResult(result)
  }

  private buildBody(
    state: AgentRenderMessageState,
    timestamp: number,
    typewriterCompleted = false
  ): ChatMessage {
    return this.output.buildCommittedBody(state, timestamp, typewriterCompleted)
  }
}
