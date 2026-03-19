import type { ToolCallProps } from '../types'

export interface ToolExecutionResult {
  id: string
  index: number
  name: string
  content: any
  cost: number
  error?: Error
  status: 'success' | 'error' | 'timeout' | 'aborted'
}

export interface ToolExecutionProgress {
  id: string
  name: string
  phase: 'started' | 'completed' | 'failed'
  result?: ToolExecutionResult
}

export interface ToolExecutorConfig {
  maxConcurrency?: number
  onProgress?: (progress: ToolExecutionProgress) => void
  signal?: AbortSignal
  chatUuid?: string
  requestConfirmation?: (request: {
    toolCallId: string
    name: string
    args?: unknown
    ui?: {
      title?: string
      riskLevel?: 'risky' | 'dangerous'
      reason?: string
      command?: string
      executionReason?: string
      possibleRisk?: string
      riskScore?: number
    }
  }) => Promise<{ approved: boolean; reason?: string; args?: unknown }>
}

export interface IToolExecutor {
  execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]>
}
