import type { ToolConfirmation } from '@shared/tools/confirmation'
import type { EmbeddedToolOutputChunk } from '@tools/registry'
import type {
  PendingToolQuestion,
  ToolUserQuestionResolutionStatus
} from '@shared/tools/userQuestion'
import type { ToolFailure } from '@shared/tools/toolFailure'

export interface ToolOutputBatch {
  toolCallId: string
  sequence: number
  chunks: EmbeddedToolOutputChunk[]
  stdoutBytes: number
  stderrBytes: number
}

export type RunToolCall = {
  id: string
  name: string
  args: string
  status: 'pending' | 'executing' | 'success' | 'failed' | 'aborted'
  result?: unknown
  error?: string
  failure?: ToolFailure
  executionStartedAt?: number
  cost?: number
  latencyCost?: number
  index?: number
}

export const RUN_TOOL_EVENTS = {
  TOOL_CALL_DETECTED: 'tool.call.detected',
  TOOL_CONFIRMATION_REQUIRED: 'tool.confirmation.required',
  TOOL_CONFIRMATION_RESOLVED: 'tool.confirmation.resolved',
  TOOL_USER_QUESTION_REQUIRED: 'tool.user_question.required',
  TOOL_USER_QUESTION_RESOLVED: 'tool.user_question.resolved',
  TOOL_EXECUTION_STARTED: 'tool.execution.started',
  TOOL_EXECUTION_OUTPUT: 'tool.execution.output',
  TOOL_EXECUTION_COMPLETED: 'tool.execution.completed',
  TOOL_EXECUTION_FAILED: 'tool.execution.failed'
} as const

export type RunToolEventPayloads = {
  'tool.call.detected': { toolCall: RunToolCall }
  'tool.confirmation.required': ToolConfirmation
  'tool.confirmation.resolved': ToolConfirmation
  'tool.user_question.required': Omit<PendingToolQuestion, 'submissionId' | 'chatUuid'>
  'tool.user_question.resolved': {
    toolCallId: string
    interactionId: string
    status: ToolUserQuestionResolutionStatus
    reason?: string
  }
  'tool.execution.started': { toolCallId: string; name: string; timestamp: number; executionStartedAt: number }
  'tool.execution.output': ToolOutputBatch
  'tool.execution.completed': { toolCallId: string; result: unknown; cost: number; latencyCost?: number; executionStartedAt?: number; failure?: ToolFailure }
  'tool.execution.failed': { toolCallId: string; error: import('./lifecycle-events').SerializedError | Error; failure?: ToolFailure }
}
