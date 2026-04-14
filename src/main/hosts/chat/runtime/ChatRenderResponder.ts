import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import type { StepArtifact } from '@main/agent/contracts'
import {
  HostRenderStateController,
  type AgentRenderMessageState,
  type HostRenderEvent,
  type HostRenderEventSink,
  type HostRenderState
} from '@main/hosts/shared/render'
import { serializeError } from '@main/utils/serializeError'
import { ChatRenderMapper } from './ChatRenderMapper'
import { ChatRenderOutput } from './ChatRenderOutput'

export class ChatRenderResponder implements HostRenderEventSink {
  private readonly state = new HostRenderStateController()
  private readonly mapper = new ChatRenderMapper()
  private readonly output: ChatRenderOutput

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

  async handle(event: HostRenderEvent): Promise<void> {
    let previousState = this.state.snapshot()
    const nextState = this.state.apply(event)
    await this.handleHostRenderEvent(event, previousState, nextState)
    previousState = nextState
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.output.getFinalAssistantMessage()
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.state.snapshot().lastUsage
  }

  getArtifacts(): StepArtifact[] {
    return this.output.getArtifacts()
  }

  private shouldEmitPreviewTextPatch(
    previousPreview: AgentRenderMessageState | null,
    nextPreview: AgentRenderMessageState | null
  ): boolean {
    return Boolean(previousPreview && nextPreview && previousPreview.stepId === nextPreview.stepId)
      && this.mapper.canEmitOptimizedTextPreviewPatch(previousPreview!, nextPreview!)
  }

  private shouldEmitPreviewReasoningPatch(
    previousPreview: AgentRenderMessageState | null,
    nextPreview: AgentRenderMessageState | null
  ): boolean {
    return Boolean(previousPreview && nextPreview && previousPreview.stepId === nextPreview.stepId)
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

  private async handleHostRenderEvent(
    event: HostRenderEvent,
    previousState: HostRenderState,
    nextState: HostRenderState
  ): Promise<void> {
    switch (event.type) {
      case 'host.lifecycle.updated':
        this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: event.state })
        return

      case 'host.preview.updated':
        if (this.shouldEmitPreviewTextPatch(previousState.preview, nextState.preview)) {
          this.emitPreviewTextPatch(nextState.preview)
          return
        }

        if (this.shouldEmitPreviewReasoningPatch(previousState.preview, nextState.preview)) {
          this.emitPreviewReasoningPatch(nextState.preview)
          return
        }

        this.emitPreview(nextState.preview, event.timestamp)
        return

      case 'host.preview.cleared':
        this.output.clearPreview()
        return

      case 'host.committed.updated':
        this.output.commitAssistantMessage(this.buildBody(
          nextState.committed,
          event.timestamp,
          event.previewWasActive || this.output.getCommittedTypewriterCompleted()
        ))
        return

      case 'host.tool.detected':
        this.emitter.emit(RUN_TOOL_EVENTS.TOOL_CALL_DETECTED, {
          toolCall: {
            id: event.toolCallId,
            name: event.toolName,
            args: event.toolArgs || '',
            status: 'pending',
            index: event.toolCallIndex
          }
        })
        return

      case 'host.tool.execution.started':
        this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_STARTED, {
          toolCallId: event.toolCallId,
          name: event.toolName
        })
        return

      case 'host.tool.result.available':
        if (event.result.status === 'success') {
          this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED, {
            toolCallId: event.result.toolCallId,
            result: event.result.content,
            cost: event.result.cost ?? 0
          })
        } else if (event.result.status !== 'denied') {
          this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_FAILED, {
            toolCallId: event.result.toolCallId,
            error: serializeError(new Error(event.result.error?.message || (
              event.result.status === 'aborted' ? 'Tool execution aborted' : 'Tool execution failed'
            )))
          })
        }
        await this.handleToolResult(event.result)
        return

      case 'host.usage.updated':
        return
    }
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
