export type BuiltInSubagentRole = 'general' | 'researcher' | 'coder' | 'reviewer'

export type SubagentRole = BuiltInSubagentRole | (string & {})

export type SubagentStatus = 'queued' | 'running' | 'waiting_for_confirmation' | 'completed' | 'failed' | 'cancelled'

export interface SubagentSpawnArgs {
  task: string
  role?: SubagentRole
  context_mode?: 'minimal' | 'current_chat_summary'
  files?: string[]
  background?: boolean
}

export interface SubagentArtifacts {
  tools_used: string[]
  files_touched: string[]
}

export interface SubagentRecord {
  id: string
  status: SubagentStatus
  role: SubagentRole
  task: string
  created_at: number
  started_at?: number
  finished_at?: number
  summary?: string
  artifacts?: SubagentArtifacts
  error?: string
  parent_chat_uuid?: string
}

export interface SubagentSpawnResponse {
  success: boolean
  subagent?: SubagentRecord
  message: string
}

export interface SubagentWaitArgs {
  subagent_id: string
  timeout_seconds?: number
}

export interface SubagentWaitResponse {
  success: boolean
  subagent?: SubagentRecord
  message: string
}
