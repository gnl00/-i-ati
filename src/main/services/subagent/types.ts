import type { ContextRecord } from '@main/agent/runtime/context/ContextRecord'
import type { SteeringMessageSource } from '@main/agent/runtime/steering/SteeringMessageSource'
import type { ContextSnapshot } from '@main/agent/runtime/context/ContextSnapshot'
import type { SubagentArtifacts, SubagentRecord, SubagentRole, SubagentStatus } from '@tools/subagent/index.d'

export type SubagentModelRuntimeInput = {
  modelRef: ModelRef
  chatUuid?: string
}

export type SubagentContextMode = 'minimal' | 'current_chat_summary'

export type SubagentSpawnInput = SubagentModelRuntimeInput & {
  subagentId?: string
  runId?: string
  workspacePath?: string
  history?: readonly ContextRecord[]
  steeringMessageSource?: SteeringMessageSource
  requestMessageId?: string
  initialMessageIds?: string[]
  previousRunId?: string
  task: string
  role: SubagentRole
  contextMode: SubagentContextMode
  files: string[]
  parentSubmissionId?: string
  permissionApprovalMode?: PermissionApprovalMode
  signal?: AbortSignal
}

export type SubagentExecutionResult = {
  usage?: ITokenUsage
  transcript?: ContextSnapshot
  status: 'completed' | 'failed' | 'cancelled'
  error?: string
  summary: string
  artifacts: SubagentArtifacts
}

export type SubagentRecordInternal = SubagentRecord & {
  waiters: Set<() => void>
}

export type SubagentTerminalStatus = Extract<SubagentStatus, 'completed' | 'failed' | 'cancelled' | 'interrupted'>
