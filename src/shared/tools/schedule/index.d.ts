export type ScheduleType = 'once' | 'cron'

export type ScheduleTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'dismissed'

export type ScheduleRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ScheduleTask {
  id: string
  chat_uuid: string
  plan_id: string | null
  goal: string
  schedule_type: ScheduleType
  cron_expression: string | null
  run_at: number
  timezone: string | null
  status: ScheduleTaskStatus
  payload: string | null
  max_attempts: number
  last_run_at: number | null
  last_run_status: ScheduleRunStatus | null
  run_count: number
  last_error: string | null
  result_message_id: number | null
  created_at: number
  updated_at: number
}

export interface ScheduleTaskRun {
  id: string
  task_id: string
  scheduled_for: number
  next_attempt_at: number
  status: ScheduleRunStatus
  attempt_count: number
  submission_id: string | null
  started_at: number | null
  finished_at: number | null
  last_error: string | null
  result_message_id: number | null
  created_at: number
  updated_at: number
}

export interface ScheduleCreateResponse {
  success: boolean
  task?: ScheduleTask
  message?: string
  currentDateTime?: string
}

export interface ScheduleListResponse {
  success: boolean
  tasks?: ScheduleTask[]
  message?: string
  currentDateTime?: string
}

export interface ScheduleCancelResponse {
  success: boolean
  id?: string
  message?: string
  currentDateTime?: string
}

export interface ScheduleUpdateResponse {
  success: boolean
  task?: ScheduleTask
  message?: string
  currentDateTime?: string
}

export interface ScheduleStatusUpdateResponse {
  success: boolean
  task?: ScheduleTask
  message?: string
}
