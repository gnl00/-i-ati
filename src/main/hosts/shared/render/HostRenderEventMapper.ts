import { RUN_STATES } from '@shared/run/lifecycle-events'
import type { RunState } from '@shared/run/lifecycle-events'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import { AgentRenderStateReducer } from './AgentRenderStateReducer'
import type { HostRenderEvent } from './HostRenderEvent'
import type { HostRenderState } from './HostRenderState'

export class HostRenderEventMapper {
  private readonly reducer = new AgentRenderStateReducer()
  private lifecycle: RunState | undefined
  private lastUsage: ITokenUsage | undefined

  /**
   * host-facing 状态快照。
   *
   * P0：这是 host 侧唯一的 render 状态真源。此前 `HostRenderStateController` 会把
   * mapper 已算好、并塞进 host event 的 preview/committed 再深拷贝存一遍（影子 reducer）。
   * 现在直接由 mapper 暴露，避免同一份 committed/preview 被同构建模两次。
   */
  snapshot(): HostRenderState {
    const state = this.reducer.snapshot()
    return {
      committed: state.committed,
      preview: state.preview,
      lifecycle: this.lifecycle,
      lastUsage: this.lastUsage
    }
  }

  map(event: AgentEvent): HostRenderEvent[] {
    const next = this.reducer.apply(event)
    const hostEvents = this.buildHostEvents(event, next)

    // 从产出的 host event 里 fold lifecycle / usage，作为 host 侧唯一状态真源。
    for (const hostEvent of hostEvents) {
      if (hostEvent.type === 'host.lifecycle.updated') {
        this.lifecycle = hostEvent.state
      } else if (hostEvent.type === 'host.usage.updated') {
        this.lastUsage = hostEvent.usage
      }
    }

    return hostEvents
  }

  private buildHostEvents(
    event: AgentEvent,
    next: ReturnType<AgentRenderStateReducer['snapshot']>
  ): HostRenderEvent[] {
    const hostEvents: HostRenderEvent[] = []

    // P2：usage 是否变化由 reducer 在 fold 时判定（usage_delta 或 step 收口都可能改），
    // 不再靠 mapper 自己 snapshot previous 做 lastUsage !== 比较。
    if (this.reducer.lastUsageChanged && next.lastUsage) {
      hostEvents.push({
        type: 'host.usage.updated',
        timestamp: this.resolveTimestamp(event),
        usage: next.lastUsage
      })
    }

    switch (event.type) {
      case 'step.started':
        hostEvents.push({
          type: 'host.lifecycle.updated',
          timestamp: event.timestamp,
          state: RUN_STATES.STREAMING
        })
        return hostEvents

      case 'step.delta':
        if (event.delta.type === 'tool_call_ready') {
          hostEvents.push({
            type: 'host.tool.detected',
            timestamp: event.timestamp,
            stepId: event.stepId,
            toolCallId: event.delta.toolCall.id,
            toolCallIndex: event.delta.toolCall.index ?? 0,
            toolName: event.delta.toolCall.function.name,
            toolArgs: event.delta.toolCall.function.arguments
          })
        }
        if (next.preview) {
          hostEvents.push({
            type: 'host.preview.updated',
            timestamp: event.timestamp,
            preview: next.preview,
            previewEffect: this.reducer.lastPreviewEffect
          })
        }
        return hostEvents

      case 'step.completed':
      case 'step.failed':
      case 'step.aborted':
        hostEvents.push({
          type: 'host.preview.cleared',
          timestamp: event.timestamp
        })
        hostEvents.push({
          type: 'host.committed.updated',
          timestamp: event.timestamp,
          committed: next.committed,
          previewWasActive: this.reducer.lastPreviewWasActive
        })
        return hostEvents

      case 'tool.awaiting_confirmation':
        hostEvents.push({
          type: 'host.tool.confirmation.required',
          timestamp: event.timestamp,
          stepId: event.stepId,
          toolCallId: event.toolCallId,
          toolCallIndex: event.toolCallIndex,
          toolName: event.toolName
        })
        return hostEvents

      case 'tool.confirmation_denied':
        hostEvents.push({
          type: 'host.committed.updated',
          timestamp: event.timestamp,
          committed: next.committed,
          previewWasActive: false
        })
        hostEvents.push({
          type: 'host.tool.result.available',
          timestamp: event.timestamp,
          result: event.deniedResult
        })
        return hostEvents

      case 'tool.execution_progress':
        if (event.phase === 'started') {
          hostEvents.push({
            type: 'host.committed.updated',
            timestamp: event.timestamp,
            committed: next.committed,
            previewWasActive: false
          })
          hostEvents.push({
            type: 'host.lifecycle.updated',
            timestamp: event.timestamp,
            state: RUN_STATES.EXECUTING_TOOLS
          })
          hostEvents.push({
            type: 'host.tool.execution.started',
            timestamp: event.timestamp,
            stepId: event.stepId,
            toolCallId: event.toolCallId,
            toolCallIndex: event.toolCallIndex,
            toolName: event.toolName
          })
          return hostEvents
        }

        hostEvents.push({
          type: 'host.committed.updated',
          timestamp: event.timestamp,
          committed: next.committed,
          previewWasActive: false
        })
        hostEvents.push({
          type: 'host.tool.result.available',
          timestamp: event.timestamp,
          result: event.result
        })
        return hostEvents

      case 'loop.completed':
        hostEvents.push({
          type: 'host.preview.cleared',
          timestamp: event.timestamp
        })
        hostEvents.push({
          type: 'host.lifecycle.updated',
          timestamp: event.timestamp,
          state: RUN_STATES.COMPLETED
        })
        return hostEvents

      case 'loop.failed':
        hostEvents.push({
          type: 'host.preview.cleared',
          timestamp: event.timestamp
        })
        hostEvents.push({
          type: 'host.lifecycle.updated',
          timestamp: event.timestamp,
          state: RUN_STATES.FAILED
        })
        return hostEvents

      case 'loop.aborted':
        hostEvents.push({
          type: 'host.preview.cleared',
          timestamp: event.timestamp
        })
        hostEvents.push({
          type: 'host.lifecycle.updated',
          timestamp: event.timestamp,
          state: RUN_STATES.ABORTED
        })
        return hostEvents
    }
  }

  private resolveTimestamp(event: AgentEvent): number {
    return 'timestamp' in event ? event.timestamp : Date.now()
  }
}
