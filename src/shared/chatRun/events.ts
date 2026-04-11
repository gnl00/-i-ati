import type { AgentConfirmationSource } from '@tools/approval'
import type { SubagentRecord } from '@tools/subagent/index.d'

export const CHAT_RUN_STATES = {
  PREPARING: 'preparing',
  STREAMING: 'streaming',
  EXECUTING_TOOLS: 'executing_tools',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABORTED: 'aborted'
} as const

export type ChatRunState = typeof CHAT_RUN_STATES[keyof typeof CHAT_RUN_STATES]

export type SerializedError = {
  name: string
  message: string
  stack?: string
  code?: string
  cause?: SerializedError
}

export type ChatRunToolCall = {
  id: string
  name: string
  args: string
  status: 'pending' | 'executing' | 'success' | 'failed' | 'aborted'
  result?: unknown
  error?: string
  cost?: number
  index?: number
}

export type ChatRunMessageSegmentPatch = {
  segment: MessageSegment
  replaceSegments?: MessageSegment[]
  content?: ChatMessage['content']
  toolCalls?: IToolCall[]
  typewriterCompleted?: boolean
}

export const CHAT_RUN_EVENTS = {
  RUN_ACCEPTED: 'run.accepted',
  RUN_STATE_CHANGED: 'run.state.changed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_ABORTED: 'run.aborted',
  POST_RUN_PLAN: 'post_run.plan',
  CHAT_READY: 'chat.ready',
  MESSAGES_LOADED: 'messages.loaded',
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_SEGMENT_UPDATED: 'message.segment.updated',
  STREAM_PREVIEW_UPDATED: 'stream.preview.updated',
  STREAM_PREVIEW_SEGMENT_UPDATED: 'stream.preview.segment.updated',
  STREAM_PREVIEW_CLEARED: 'stream.preview.cleared',
  TOOL_CALL_DETECTED: 'tool.call.detected',
  TOOL_EXEC_REQUIRES_CONFIRMATION: 'tool.exec.requires_confirmation',
  TOOL_EXEC_STARTED: 'tool.exec.started',
  TOOL_EXEC_COMPLETED: 'tool.exec.completed',
  TOOL_EXEC_FAILED: 'tool.exec.failed',
  TOOL_RESULT_ATTACHED: 'tool.result.attached',
  SUBAGENT_UPDATED: 'subagent.updated',
  CHAT_UPDATED: 'chat.updated',
  TITLE_GENERATE_STARTED: 'title.generate.started',
  TITLE_GENERATE_COMPLETED: 'title.generate.completed',
  TITLE_GENERATE_FAILED: 'title.generate.failed',
  COMPRESSION_STARTED: 'compression.started',
  COMPRESSION_COMPLETED: 'compression.completed',
  COMPRESSION_FAILED: 'compression.failed'
} as const

export type ChatRunEventType = typeof CHAT_RUN_EVENTS[keyof typeof CHAT_RUN_EVENTS]

export type ChatRunEventPayloads = {
  'run.accepted': { accepted: true; submissionId: string }
  'run.state.changed': { state: ChatRunState }
  'run.completed': { assistantMessageId: number; usage?: ITokenUsage }
  'run.failed': { error: SerializedError | Error }
  'run.aborted': { reason?: string }
  'post_run.plan': {
    title: 'pending' | 'skipped'
    compression: 'pending' | 'skipped'
  }
  'chat.ready': {
    chatEntity: ChatEntity
    workspacePath: string
  }
  'messages.loaded': { messages: MessageEntity[] }
  'message.created': { message: MessageEntity }
  'message.updated': { message: MessageEntity }
  'message.segment.updated': { messageId: number; patch: ChatRunMessageSegmentPatch }
  'stream.preview.updated': { message: MessageEntity }
  'stream.preview.segment.updated': {
    chatId?: number
    chatUuid?: string
    patch: ChatRunMessageSegmentPatch
  }
  'stream.preview.cleared': {}
  'tool.call.detected': { toolCall: ChatRunToolCall }
  'tool.exec.requires_confirmation': {
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
  'tool.exec.started': { toolCallId: string; name: string }
  'tool.exec.completed': { toolCallId: string; result: unknown; cost: number }
  'tool.exec.failed': { toolCallId: string; error: SerializedError | Error }
  'tool.result.attached': { toolCallId: string; message: MessageEntity }
  'subagent.updated': { subagent: SubagentRecord }
  'chat.updated': { chatEntity: ChatEntity }
  'title.generate.started': { model: AccountModel; contentLength: number }
  'title.generate.completed': { title: string }
  'title.generate.failed': { error: SerializedError }
  'compression.started': { messageCount: number; chatId?: number; chatUuid?: string }
  'compression.completed': { result: CompressionResult }
  'compression.failed': { error: SerializedError; result?: CompressionResult }
}

export type ChatRunEventMeta = {
  submissionId: string
  chatId?: number
  chatUuid?: string
  cycle?: number
}

export type ChatRunEventEnvelope<T extends ChatRunEventType = ChatRunEventType> =
  ChatRunEventMeta & {
    type: T
    payload: ChatRunEventPayloads[T]
    timestamp: number
    sequence: number
  }

export type ChatRunEvent =
  { [K in ChatRunEventType]: ChatRunEventEnvelope<K> }[ChatRunEventType]
