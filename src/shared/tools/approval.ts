export type ResolvedAgentApprovalMode = 'strict' | 'relaxed'
export type PermissionApprovalMode = 'manual' | 'auto'

export const DEFAULT_PERMISSION_APPROVAL_MODE: PermissionApprovalMode = 'manual'

export function normalizePermissionApprovalMode(value: unknown): PermissionApprovalMode {
  return value === 'auto' ? 'auto' : DEFAULT_PERMISSION_APPROVAL_MODE
}

export interface ResolvedAgentApprovalPolicy {
  mode: ResolvedAgentApprovalMode
  permissionApprovalMode?: PermissionApprovalMode
}

export interface AgentConfirmationSource {
  kind: 'main' | 'subagent'
  runId?: string
  parentRunId?: string
  subagentId?: string
  role?: string
  task?: string
}
