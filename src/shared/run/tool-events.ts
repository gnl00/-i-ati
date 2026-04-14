import type { AgentConfirmationSource } from '@tools/approval'

export type RunToolCall = {
  id: string
  name: string
  args: string
  status: 'pending' | 'executing' | 'success' | 'failed' | 'aborted'
  result?: unknown
  error?: string
  cost?: number
  index?: number
}

export const RUN_TOOL_EVENTS = {
  TOOL_CALL_DETECTED: 'tool.call.detected',
  TOOL_CONFIRMATION_REQUIRED: 'tool.confirmation.required',
  TOOL_EXECUTION_STARTED: 'tool.execution.started',
  TOOL_EXECUTION_COMPLETED: 'tool.execution.completed',
  TOOL_EXECUTION_FAILED: 'tool.execution.failed'
} as const

export type RunToolEventPayloads = {
  'tool.call.detected': { toolCall: RunToolCall }
  'tool.confirmation.required': {
    toolCallId: string
    name: string
    args?: unknown
    agent?: AgentConfirmationSource
    ui?: {
      title?: string
      riskLevel?: 'risky' | 'dangerous'
      reason?: string
      command?: string
      executionReason?: string
      possibleRisk?: string
      riskScore?: number
    }
  }
  'tool.execution.started': { toolCallId: string; name: string }
  'tool.execution.completed': { toolCallId: string; result: unknown; cost: number }
  'tool.execution.failed': { toolCallId: string; error: import('./lifecycle-events').SerializedError | Error }
}
