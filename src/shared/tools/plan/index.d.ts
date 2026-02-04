export interface PlanToolResponseBase {
  success: boolean
  message?: string
  reason?: string
}

export interface PlanCreateResponse extends PlanToolResponseBase {
  plan?: TaskPlan
}

export interface PlanUpdateResponse extends PlanToolResponseBase {
  plan?: TaskPlan
}

export interface PlanUpdateStatusResponse extends PlanToolResponseBase {
  plan?: TaskPlan
}

export interface PlanGetByIdResponse extends PlanToolResponseBase {
  plan?: TaskPlan
}

export interface PlanGetByChatUuidResponse extends PlanToolResponseBase {
  plans?: TaskPlan[]
}

export interface PlanDeleteResponse extends PlanToolResponseBase {}

export interface PlanStepUpsertResponse extends PlanToolResponseBase {
  plan?: TaskPlan
}
