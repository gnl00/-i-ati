import type { ToolConfirmationRequest } from '@renderer/store/toolConfirmation'
import type { CommandConfirmationRequest } from '../chatMessage/assistant-message/CommandConfirmation'

export function buildCommandConfirmationRequest(input: {
  pendingToolConfirm: Pick<ToolConfirmationRequest, 'ui' | 'args' | 'agent'> | null
  pendingToolConfirmCount: number
}): CommandConfirmationRequest | undefined {
  const {
    pendingToolConfirm,
    pendingToolConfirmCount
  } = input

  if (!pendingToolConfirm) {
    return undefined
  }

  const pendingCommand =
    pendingToolConfirm.ui?.command ||
    ((pendingToolConfirm.args as { command?: string } | undefined)?.command ?? '')

  return {
    command: pendingCommand,
    risk_level: pendingToolConfirm.ui?.riskLevel || 'risky',
    execution_reason: pendingToolConfirm.ui?.executionReason || pendingToolConfirm.ui?.title || 'Command requires approval',
    possible_risk: pendingToolConfirm.ui?.possibleRisk || pendingToolConfirm.ui?.reason || 'Potential risk not provided',
    risk_score: pendingToolConfirm.ui?.riskScore,
    agent: pendingToolConfirm.agent,
    pending_count: pendingToolConfirmCount
  }
}
