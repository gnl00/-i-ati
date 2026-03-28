import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import type { AgentStepEventListener } from '@main/services/agentCore/contracts'
import type { ToolExecutionProgress } from '@main/services/agentCore/tools'
import type { ToolCall } from '@main/services/agentCore/types'
import { serializeError } from '@main/services/serializeError'
import {
  CHAT_RUN_EVENTS,
  CHAT_RUN_STATES
} from '@shared/chatRun/events'

export class AssistantStepEventMapper implements AgentStepEventListener {
  constructor(private readonly emitter: ChatRunEventEmitter) {}

  handlePhaseChange(phase: 'receiving' | 'toolCall'): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: phase === 'receiving'
        ? CHAT_RUN_STATES.STREAMING
        : CHAT_RUN_STATES.EXECUTING_TOOLS
    })
  }

  handleToolCallsDetected(toolCalls: ToolCall[]): void {
    for (const toolCall of toolCalls) {
      this.emitter.emit(CHAT_RUN_EVENTS.TOOL_CALL_DETECTED, { toolCall })
    }
  }

  handleToolExecutionProgress(progress: ToolExecutionProgress): void {
    if (progress.phase === 'started') {
      this.emitter.emit(CHAT_RUN_EVENTS.TOOL_EXEC_STARTED, {
        toolCallId: progress.id,
        name: progress.name
      })
      return
    }

    if (progress.phase === 'completed') {
      this.emitter.emit(CHAT_RUN_EVENTS.TOOL_EXEC_COMPLETED, {
        toolCallId: progress.id,
        result: progress.result?.content,
        cost: progress.result?.cost || 0
      })
      return
    }

    this.emitter.emit(CHAT_RUN_EVENTS.TOOL_EXEC_FAILED, {
      toolCallId: progress.id,
      error: serializeError(progress.result?.error || new Error('Tool execution failed'))
    })
  }
}
