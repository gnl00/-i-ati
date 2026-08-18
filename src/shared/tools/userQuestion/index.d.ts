export type ToolUserQuestionType = 'single_select' | 'multi_select' | 'text'

export interface ToolUserQuestionOption {
  id: string
  label: string
  description?: string
  recommended?: boolean
}

export interface ToolUserQuestion {
  id: string
  header?: string
  prompt: string
  type: ToolUserQuestionType
  required: boolean
  options?: ToolUserQuestionOption[]
  minSelections?: number
  maxSelections?: number
  placeholder?: string
  maxLength?: number
  recommendedText?: string
}

export interface ToolUserQuestionAnswer {
  questionId: string
  optionIds?: string[]
  text?: string
}

export interface ToolUserQuestionInteractionIdentity {
  submissionId: string
  chatUuid: string
  toolCallId: string
  interactionId: string
}

export interface PendingToolQuestion extends ToolUserQuestionInteractionIdentity {
  questions: ToolUserQuestion[]
  timeoutMs: number
  createdAt: number
  expiresAt: number
}

export interface ToolUserQuestionRequest {
  toolCallId: string
  interactionId: string
  chatUuid: string
  questions: ToolUserQuestion[]
  timeoutMs: number
  recommendedAnswers: ToolUserQuestionAnswer[]
}

export type ToolUserQuestionSubmitRequest = ToolUserQuestionInteractionIdentity & (
  | { action: 'submit'; answers: ToolUserQuestionAnswer[] }
  | { action: 'cancel'; reason?: string }
)

export type ToolUserQuestionSubmitFailureReason =
  | 'not_found'
  | 'identity_mismatch'
  | 'invalid_answers'
  | 'already_resolved'

export type ToolUserQuestionSubmitResult =
  | { ok: true }
  | { ok: false; reason: ToolUserQuestionSubmitFailureReason; message?: string }

export type ToolUserQuestionResolutionStatus =
  | 'submitted'
  | 'auto_submitted'
  | 'cancelled'
  | 'unavailable'

export interface ToolUserQuestionToolResult {
  status: ToolUserQuestionResolutionStatus
  interactionId?: string
  answers?: ToolUserQuestionAnswer[]
  reason?: string
}
