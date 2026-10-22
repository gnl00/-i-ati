export type BuiltInSubagentRole = 'general' | 'researcher' | 'coder' | 'reviewer'

export type SubagentRole = BuiltInSubagentRole | (string & {})

export type SubagentStatus = 'queued' | 'running' | 'waiting_for_confirmation' | 'cancelling' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

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
  revision?: number
  run_id?: string
  parent_submission_id?: string
  result_ref?: string
  persistence_error?: string
  status: SubagentStatus
  role: SubagentRole
  task: string
  created_at: number
  started_at?: number
  finished_at?: number
  usage?: ITokenUsage
  summary?: string
  artifacts?: SubagentArtifacts
  error?: string
  parent_chat_uuid?: string
}

export interface SubagentSpawnResponse {
  success: boolean
  subagent?: SubagentRecord
  message: string
  subagents?: SubagentRecord[]
  evidence?: unknown
}

export interface SubagentWaitArgs {
  subagent_id: string
  after_revision?: number
  timeout_seconds?: number
  run_id?: string
}

export interface SubagentWaitResponse {
  success: boolean
  subagent?: SubagentRecord
  message: string
  subagents?: SubagentRecord[]
  evidence?: unknown
}

export type SubagentAction = 'spawn' | 'wait' | 'cancel' | 'inspect' | 'list' | 'send_message' | 'followup_task' | 'resume' | 'interrupt'

export type SubagentArgs =
  | ({ action: 'spawn' } & SubagentSpawnArgs)
  | ({ action: 'wait' } & SubagentWaitArgs)
  | { action: 'cancel'; subagent_id: string }
  | { action: 'inspect'; subagent_id: string; run_id?: string }
  | { action: 'list' }
  | { action: 'send_message' | 'followup_task' | 'resume'; subagent_id: string; message_id: string; task?: string; message?: string }
  | { action: 'interrupt'; subagent_id: string; run_id?: string }

export type SubagentResponse =
  | SubagentSpawnResponse
  | SubagentWaitResponse
  | SubagentErrorResponse

export interface SubagentErrorResponse {
  success: false
  message: string
  subagents?: SubagentRecord[]
  evidence?: unknown
}
