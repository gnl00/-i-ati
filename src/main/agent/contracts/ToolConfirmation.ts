import type { AgentConfirmationSource } from '@tools/approval'

export type ToolConfirmationDecision = {
  approved: boolean
  reason?: string
  args?: unknown
}

export type ToolConfirmationRequest = {
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
}

export interface ToolConfirmationRequester {
  request(request: ToolConfirmationRequest): Promise<ToolConfirmationDecision>
}
