export interface ScheduleTask {
  id: string
  chat_uuid: string
  plan_id: string | null
  goal: string
  run_at: number
  timezone: string | null
  status: string
  payload: string | null
  attempt_count: number
  max_attempts: number
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
