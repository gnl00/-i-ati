import type { Plan } from '@shared/task-planner/schemas'

export type PlanAction =
  | 'create'
  | 'update'
  | 'update_status'
  | 'get_by_id'
  | 'get_current_chat'
  | 'delete'
  | 'step_upsert'

export interface PlanToolResponseBase {
  success: boolean
  message?: string
  reason?: string
}

export interface PlanCreateResponse extends PlanToolResponseBase {
  plan?: Plan
}

export interface PlanUpdateResponse extends PlanToolResponseBase {
  plan?: Plan
}

export interface PlanUpdateStatusResponse extends PlanToolResponseBase {
  plan?: Plan
}

export interface PlanGetByIdResponse extends PlanToolResponseBase {
  plan?: Plan
}

export interface PlanGetByChatUuidResponse extends PlanToolResponseBase {
  plans?: Plan[]
}

export interface PlanDeleteResponse extends PlanToolResponseBase {}

export interface PlanStepUpsertResponse extends PlanToolResponseBase {
  plan?: Plan
}

export type PlanResponse =
  | PlanCreateResponse
  | PlanUpdateResponse
  | PlanUpdateStatusResponse
  | PlanGetByIdResponse
  | PlanGetByChatUuidResponse
  | PlanDeleteResponse
  | PlanStepUpsertResponse
