import type { AgentStepFailureInfo } from '@main/agent/runtime/step/AgentStep'

export type AgentRenderToolCallStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'aborted'

export interface AgentRenderToolCallState {
  toolCallId: string
  toolCallIndex?: number
  name: string
  args?: string
  appearanceOrder?: number
  cost?: number
  status: AgentRenderToolCallStatus
  result?: unknown
  error?: string
}

export interface AgentRenderTextBlock {
  blockId: string
  kind: 'text'
  stepId: string
  content: string
  startedAt: number
  endedAt?: number
}

export interface AgentRenderReasoningBlock {
  blockId: string
  kind: 'reasoning'
  stepId: string
  content: string
  startedAt: number
  endedAt?: number
}

export interface AgentRenderToolBlock {
  blockId: string
  kind: 'tool'
  stepId: string
  toolCallId: string
  startedAt: number
  endedAt?: number
}

export type AgentRenderBlock =
  | AgentRenderTextBlock
  | AgentRenderReasoningBlock
  | AgentRenderToolBlock

export interface AgentRenderMessageState {
  stepId?: string
  content: string
  blocks: AgentRenderBlock[]
  toolCalls: AgentRenderToolCallState[]
  failure?: AgentStepFailureInfo | { message: string }
}

export interface AgentRenderState {
  committed: AgentRenderMessageState
  preview: AgentRenderMessageState | null
  lastUsage?: ITokenUsage
}
