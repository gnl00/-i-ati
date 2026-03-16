import type { ToolExecutionProgress } from '../tools'
import type { ToolCall } from '../types'

export interface AgentEventMapper {
  handlePhaseChange(phase: 'receiving' | 'toolCall'): void
  handleToolCallsDetected(toolCalls: ToolCall[]): void
  handleToolExecutionProgress(progress: ToolExecutionProgress): void
  emitMessageUpdated(message: MessageEntity): void
  emitToolResultAttached(toolCallId: string, message: MessageEntity): void
}
