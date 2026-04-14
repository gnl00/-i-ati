import { RUN_STATES } from '@shared/run/lifecycle-events'
import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import { AgentRenderStateReducer } from './AgentRenderStateReducer'
import type { HostRenderEvent } from './HostRenderEvent'

export class HostRenderEventMapper {
  private readonly reducer = new AgentRenderStateReducer()

  map(event: AgentEvent): HostRenderEvent[] {
    const previous = this.reducer.snapshot()
    const next = this.reducer.apply(event)
    const hostEvents: HostRenderEvent[] = []

    if (next.lastUsage && next.lastUsage !== previous.lastUsage) {
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
            toolCallIndex: event.delta.toolCall.index,
            toolName: event.delta.toolCall.function.name,
            toolArgs: event.delta.toolCall.function.arguments
          })
        }
        if (next.preview) {
          hostEvents.push({
            type: 'host.preview.updated',
            timestamp: event.timestamp,
            preview: next.preview
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
          previewWasActive: Boolean(previous.preview)
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
