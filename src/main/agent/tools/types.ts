import type { ToolCallProps } from '@main/agent/contracts'
import type { AgentConfirmationSource, ResolvedAgentApprovalPolicy } from '@tools/approval'
import type { ToolOutputBatch } from '@shared/run/tool-events'

export interface ToolExecutionResult {
  id: string
  index: number
  name: string
  content: any
  cost: number
  error?: Error
  status: 'success' | 'error' | 'timeout' | 'aborted'
}

export type { ToolOutputBatch } from '@shared/run/tool-events'

export type ToolExecutionProgress = {
  id: string
  name: string
  phase: 'started' | 'completed' | 'failed'
  result?: ToolExecutionResult
} | {
  id: string
  name: string
  phase: 'output'
  output: ToolOutputBatch
}

export interface ToolExecutorConfig {
  maxConcurrency?: number
  onProgress?: (progress: ToolExecutionProgress) => void
  signal?: AbortSignal
  chatUuid?: string
  workspaceRoot?: string
  submissionId?: string
  modelRef?: ModelRef
  allowedTools?: string[]
  approvalPolicy?: ResolvedAgentApprovalPolicy
  confirmationSource?: AgentConfirmationSource
  requestConfirmation?: (request: {
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
      filesystemScope?: 'workspace' | 'outside_workspace' | 'unknown'
      inferredFilesystemScope?: 'workspace' | 'outside_workspace' | 'unknown'
      filesystemReason?: string
    }
  }) => Promise<{ approved: boolean; reason?: string; args?: unknown }>
}

export interface IToolExecutor {
  execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]>
}
