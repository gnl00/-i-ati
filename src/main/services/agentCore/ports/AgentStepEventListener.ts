import type { ToolExecutionProgress } from '../tools'
import type { ToolCall } from '../types'

export interface AgentStepEventListener {
  handlePhaseChange(phase: 'receiving' | 'toolCall'): void
  handleToolCallsDetected(toolCalls: ToolCall[]): void
  handleToolExecutionProgress(progress: ToolExecutionProgress): void
}
