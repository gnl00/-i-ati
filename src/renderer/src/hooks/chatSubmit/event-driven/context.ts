import type {
  ChatControlState,
  ChatInputState,
  ChatMetaState,
  ChatSessionState
} from '../types'

export type StreamingState = {
  tools: import('../types').ToolCall[]
}

export type SubmissionContext = {
  input: ChatInputState
  session: ChatSessionState
  control: ChatControlState
  meta: ChatMetaState
  systemPrompts: string[]
  compressionSummary?: CompressedSummaryEntity | null
  request?: IUnifiedRequest
  streaming?: StreamingState
}
