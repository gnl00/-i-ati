import type { AgentStepFailureInfo } from '@main/agent/runtime/step/AgentStep'

export type AgentUiToolCallStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'aborted'

export interface AgentUiToolCallState {
  toolCallId: string
  toolCallIndex?: number
  name: string
  args?: string
  appearanceOrder?: number
  cost?: number
  status: AgentUiToolCallStatus
  result?: unknown
  error?: string
}

export interface AgentUiTextBlockState {
  blockId: string
  kind: 'text'
  stepId: string
  content: string
  startedAt: number
  endedAt?: number
}

export interface AgentUiReasoningBlockState {
  blockId: string
  kind: 'reasoning'
  stepId: string
  content: string
  startedAt: number
  endedAt?: number
}

export interface AgentUiToolCallBlockState {
  blockId: string
  kind: 'toolCall'
  stepId: string
  toolCallId: string
  startedAt: number
  endedAt?: number
}

export type AgentUiContentBlockState =
  | AgentUiTextBlockState
  | AgentUiReasoningBlockState
  | AgentUiToolCallBlockState

export interface AgentUiMessageState {
  stepId?: string
  content: string
  contentBlocks: AgentUiContentBlockState[]
  toolCalls: AgentUiToolCallState[]
  failure?: AgentStepFailureInfo | { message: string }
}

export interface AgentUiState {
  committed: AgentUiMessageState
  preview: AgentUiMessageState | null
  lastUsage?: ITokenUsage
}
