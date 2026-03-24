import type { SubagentArtifacts, SubagentRecord, SubagentRole, SubagentStatus } from '@tools/subagent/index.d'

export type SubagentModelRuntimeInput = {
  modelRef: ModelRef
  chatUuid?: string
}

export type SubagentContextMode = 'minimal' | 'current_chat_summary'

export type SubagentSpawnInput = SubagentModelRuntimeInput & {
  subagentId?: string
  task: string
  role: SubagentRole
  contextMode: SubagentContextMode
  files: string[]
  parentSubmissionId?: string
}

export type SubagentExecutionResult = {
  summary: string
  artifacts: SubagentArtifacts
}

export type SubagentRecordInternal = SubagentRecord & {
  completion: Promise<void>
  resolveCompletion: () => void
}

export type SubagentTerminalStatus = Extract<SubagentStatus, 'completed' | 'failed' | 'cancelled'>
