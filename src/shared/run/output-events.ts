import type { AgentConfirmationSource } from '@tools/approval'
import type { SubagentRecord } from '@tools/subagent/index.d'

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

export type MessageSegmentPatch = {
  segment: MessageSegment
  replaceSegments?: MessageSegment[]
  content?: ChatMessage['content']
  toolCalls?: IToolCall[]
  typewriterCompleted?: boolean
}

export const RUN_OUTPUT_EVENTS = {
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_SEGMENT_UPDATED: 'message.segment.updated',
  PREVIEW_UPDATED: 'preview.updated',
  PREVIEW_SEGMENT_UPDATED: 'preview.segment.updated',
  PREVIEW_CLEARED: 'preview.cleared',
  TOOL_CALL_DETECTED: 'tool.call.detected',
  TOOL_CONFIRMATION_REQUIRED: 'tool.confirmation.required',
  TOOL_EXECUTION_STARTED: 'tool.execution.started',
  TOOL_EXECUTION_COMPLETED: 'tool.execution.completed',
  TOOL_EXECUTION_FAILED: 'tool.execution.failed',
  TOOL_RESULT_ATTACHED: 'tool.result.attached',
  SUBAGENT_UPDATED: 'subagent.updated'
} as const

export type RunOutputEventPayloads = {
  'message.created': { message: MessageEntity }
  'message.updated': { message: MessageEntity }
  'message.segment.updated': { messageId: number; patch: MessageSegmentPatch }
  'preview.updated': { message: MessageEntity }
  'preview.segment.updated': {
    chatId?: number
    chatUuid?: string
    patch: MessageSegmentPatch
  }
  'preview.cleared': {}
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
  'tool.result.attached': { toolCallId: string; message: MessageEntity }
  'subagent.updated': { subagent: SubagentRecord }
}

