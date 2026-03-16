import type { ChatRunEventEmitter } from '@main/services/chatRun/infrastructure'
import type { AgentEventMapper } from '@main/services/agentCore/contracts'
import type { ToolExecutionProgress } from '@main/services/agentCore/tools'
import type { ToolCall } from '@main/services/agentCore/types'
import {
  CHAT_RUN_EVENTS,
  CHAT_RUN_STATES,
  type SerializedError
} from '@shared/chatRun/events'

export class AssistantStepEventMapper implements AgentEventMapper {
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
      error: this.serializeError(progress.result?.error || new Error('Tool execution failed'))
    })
  }

  emitMessageUpdated(message: MessageEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.MESSAGE_UPDATED, { message })
  }

  emitToolResultAttached(toolCallId: string, message: MessageEntity): void {
    this.emitter.emit(CHAT_RUN_EVENTS.TOOL_RESULT_ATTACHED, {
      toolCallId,
      message
    })
  }

  private serializeError(error: any, depth: number = 0): SerializedError {
    const serialized: SerializedError = {
      name: error?.name || 'Error',
      message: error?.message || 'Unknown error',
      stack: error?.stack as string | undefined,
      code: typeof error?.code === 'string' ? error.code : undefined
    }

    if (depth >= 3 || !error?.cause) {
      return serialized
    }

    return {
      ...serialized,
      cause: this.serializeError(error.cause, depth + 1)
    }
  }
}
