export type ResolvedAgentApprovalMode = 'strict' | 'relaxed'

export interface ResolvedAgentApprovalPolicy {
  mode: ResolvedAgentApprovalMode
}

export interface AgentConfirmationSource {
  kind: 'main' | 'subagent'
  runId?: string
  parentRunId?: string
  subagentId?: string
  role?: string
  task?: string
}
