import { RUN_LIFECYCLE_EVENTS } from '@shared/run/lifecycle-events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import { ChatEventMapper } from '../mapping/ChatEventMapper'
import { ChatStepStore } from '../persistence/ChatStepStore'
import {
  type AgentRenderMessageState,
  type AgentRenderState,
  type HostRenderEvent,
  type HostRenderEventSink
} from '@main/hosts/shared/render'
import { serializeError } from '@main/utils/serializeError'
import { ChatRenderMapper } from './ChatRenderMapper'
import { ChatRenderOutput } from './ChatRenderOutput'
import {
  noopToolResultCompactionTrigger,
  type ToolResultCompactionTrigger
} from './ToolResultCompactionTrigger'

export class ChatRenderResponder implements HostRenderEventSink {
  private readonly mapper = new ChatRenderMapper()
  private readonly output: ChatRenderOutput
  private renderStateSource: { snapshot(): AgentRenderState } | undefined

  constructor(
    private readonly emitter: import('@main/agent/contracts').RunEventEmitter,
    messageEntities: MessageEntity[],
    assistantDraft: MessageEntity,
    stepStore = new ChatStepStore(),
    toolResultCompactionTrigger: ToolResultCompactionTrigger = noopToolResultCompactionTrigger,
    signal?: AbortSignal
  ) {
    this.output = new ChatRenderOutput(
      emitter,
      messageEntities,
      assistantDraft,
      stepStore,
      this.mapper,
      toolResultCompactionTrigger,
      signal
    )
  }

  get messageEvents(): ChatEventMapper {
    return this.output.messageEvents
  }

  connectRenderStateSource(stateSource: { snapshot(): AgentRenderState }): void {
    this.renderStateSource = stateSource
  }

  async handle(event: HostRenderEvent): Promise<void> {
    await this.handleHostRenderEvent(event)
  }

  getFinalAssistantMessage(): MessageEntity {
    return this.output.getFinalAssistantMessage()
  }

  getLastUsage(): ITokenUsage | undefined {
    return this.renderStateSource?.snapshot().lastUsage
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
    event: HostRenderEvent
  ): Promise<void> {
    switch (event.type) {
      case 'host.lifecycle.updated':
        this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, { state: event.state })
        return

      case 'host.preview.updated':
        // P2：append 语义由 reducer 前移到 previewEffect，直接按字段决定 emit，
        // 不再比较 previous/next preview blocks 把语义 diff 回来。
        if (event.previewEffect === 'text_append') {
          this.emitPreviewTextPatch(event.preview)
          return
        }

        if (event.previewEffect === 'reasoning_append') {
          this.emitPreviewReasoningPatch(event.preview)
          return
        }

        this.emitPreview(event.preview, event.timestamp)
        return

      case 'host.preview.cleared':
        this.output.clearPreview()
        return

      case 'host.committed.updated':
        this.output.commitAssistantMessage(this.buildBody(
          event.committed,
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
          name: event.toolName,
          timestamp: event.timestamp,
          executionStartedAt: event.timestamp
        })
        return

      case 'host.tool.execution.output':
        this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_OUTPUT, event.output)
        return

      case 'host.tool.result.available': {
        const resolvedContent = await this.handleToolResult(event.result)
        if (event.result.status === 'success') {
          this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_COMPLETED, {
            toolCallId: event.result.toolCallId,
            result: resolvedContent,
            cost: event.result.cost ?? 0,
            ...(event.result.executionStartedAt !== undefined ? {
              executionStartedAt: event.result.executionStartedAt
            } : {}),
            ...(event.result.latencyCost !== undefined ? {
              latencyCost: event.result.latencyCost
            } : {})
          })
        } else if (event.result.status !== 'denied') {
          this.emitter.emit(RUN_TOOL_EVENTS.TOOL_EXECUTION_FAILED, {
            toolCallId: event.result.toolCallId,
            error: serializeError(new Error(event.result.error?.message || (
              event.result.status === 'aborted' ? 'Tool execution aborted' : 'Tool execution failed'
            )))
          })
        }
        return
      }

      case 'host.usage.updated':
        return
    }
  }

  private async handleToolResult(result: ToolResultFact): Promise<string> {
    return await this.output.appendToolResult(result)
  }

  private buildBody(
    state: AgentRenderMessageState,
    timestamp: number,
    typewriterCompleted = false
  ): ChatMessage {
    return this.output.buildCommittedBody(state, timestamp, typewriterCompleted)
  }
}
