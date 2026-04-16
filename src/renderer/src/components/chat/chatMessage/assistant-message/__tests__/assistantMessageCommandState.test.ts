import { describe, expect, it } from 'vitest'
import { buildAssistantMessageCommandState } from '../model/assistantMessageCommandState'

describe('buildAssistantMessageCommandState', () => {
  it('builds command confirmation request when execute_command is pending', () => {
    const state = buildAssistantMessageCommandState({
      isCommandConfirmPending: true,
      pendingToolConfirm: {
        ui: {
          command: 'rm -rf /tmp/x',
          riskLevel: 'dangerous',
          executionReason: 'Need cleanup',
          possibleRisk: 'Deletes files',
          riskScore: 9
        }
      },
      pendingToolConfirmCount: 2
    })

    expect(state.commandConfirmationRequest).toMatchObject({
      command: 'rm -rf /tmp/x',
      risk_level: 'dangerous',
      execution_reason: 'Need cleanup',
      possible_risk: 'Deletes files',
      risk_score: 9,
      pending_count: 2
    })
  })

  it('returns empty state when command confirmation is not pending', () => {
    const state = buildAssistantMessageCommandState({
      isCommandConfirmPending: false,
      pendingToolConfirm: null,
      pendingToolConfirmCount: 0
    })

    expect(state.commandConfirmationRequest).toBeUndefined()
  })
})
