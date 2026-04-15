import type { CommandConfirmationRequest } from '../CommandConfirmation'
import { shouldShowAssistantMessageOperations } from '../assistant-message-visibility'

export interface AssistantMessageLayoutStateInput {
  committedMessage: ChatMessage
  isLatest: boolean
  isOverlayPreview: boolean
  isCommandConfirmPending: boolean
  pendingToolConfirm: {
    ui?: {
      command?: string
      riskLevel?: 'risky' | 'dangerous'
      executionReason?: string
      title?: string
      possibleRisk?: string
      reason?: string
      riskScore?: number
    }
    args?: unknown
    agent?: AgentConfirmationSource
  } | null
  pendingToolConfirmCount: number
}

export interface AssistantMessageLayoutState {
  showCommandConfirmation: boolean
  commandConfirmationRequest?: CommandConfirmationRequest
  showOperations: boolean
  showRegenerate: boolean
}

export function buildAssistantMessageLayoutState(
  input: AssistantMessageLayoutStateInput
): AssistantMessageLayoutState {
  const {
    committedMessage,
    isLatest,
    isOverlayPreview,
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  } = input

  const pendingCommand =
    pendingToolConfirm?.ui?.command ||
    ((pendingToolConfirm?.args as { command?: string } | undefined)?.command ?? '')

  const commandConfirmationRequest = isCommandConfirmPending
    ? {
        command: pendingCommand,
        risk_level: pendingToolConfirm?.ui?.riskLevel || 'risky',
        execution_reason: pendingToolConfirm?.ui?.executionReason || pendingToolConfirm?.ui?.title || 'Command requires approval',
        possible_risk: pendingToolConfirm?.ui?.possibleRisk || pendingToolConfirm?.ui?.reason || 'Potential risk not provided',
        risk_score: pendingToolConfirm?.ui?.riskScore,
        agent: pendingToolConfirm?.agent,
        pending_count: pendingToolConfirmCount
      }
    : undefined

  return {
    showCommandConfirmation: isCommandConfirmPending,
    commandConfirmationRequest,
    showOperations: shouldShowAssistantMessageOperations({
      messageSource: committedMessage.source,
      hasPreviewMessage: isOverlayPreview
    }),
    showRegenerate: isLatest
  }
}
