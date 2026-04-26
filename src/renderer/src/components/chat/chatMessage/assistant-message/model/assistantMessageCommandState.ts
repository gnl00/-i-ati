import type { CommandConfirmationRequest } from '../CommandConfirmation'
import type { AgentConfirmationSource } from '@shared/tools/approval'

export interface AssistantMessageCommandStateInput {
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

export interface AssistantMessageCommandState {
  commandConfirmationRequest?: CommandConfirmationRequest
}

export function buildAssistantMessageCommandState(
  input: AssistantMessageCommandStateInput
): AssistantMessageCommandState {
  const {
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  } = input

  if (!isCommandConfirmPending) {
    return {}
  }

  const pendingCommand =
    pendingToolConfirm?.ui?.command ||
    ((pendingToolConfirm?.args as { command?: string } | undefined)?.command ?? '')

  return {
    commandConfirmationRequest: {
      command: pendingCommand,
      risk_level: pendingToolConfirm?.ui?.riskLevel || 'risky',
      execution_reason: pendingToolConfirm?.ui?.executionReason || pendingToolConfirm?.ui?.title || 'Command requires approval',
      possible_risk: pendingToolConfirm?.ui?.possibleRisk || pendingToolConfirm?.ui?.reason || 'Potential risk not provided',
      risk_score: pendingToolConfirm?.ui?.riskScore,
      agent: pendingToolConfirm?.agent,
      pending_count: pendingToolConfirmCount
    }
  }
}
