import { describe, expect, it } from 'vitest'
import { buildAssistantMessageLayoutState } from '../model/assistantMessageLayoutState'

describe('buildAssistantMessageLayoutState', () => {
  it('builds command confirmation state when execute_command is pending', () => {
    const state = buildAssistantMessageLayoutState({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: []
      },
      isLatest: true,
      isOverlayPreview: false,
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

    expect(state.showCommandConfirmation).toBe(true)
    expect(state.commandConfirmationRequest).toMatchObject({
      command: 'rm -rf /tmp/x',
      risk_level: 'dangerous',
      execution_reason: 'Need cleanup',
      possible_risk: 'Deletes files',
      risk_score: 9,
      pending_count: 2
    })
  })

  it('hides operations for overlay preview rows', () => {
    const state = buildAssistantMessageLayoutState({
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        segments: []
      },
      isLatest: true,
      isOverlayPreview: true,
      isCommandConfirmPending: false,
      pendingToolConfirm: null,
      pendingToolConfirmCount: 0
    })

    expect(state.showOperations).toBe(false)
    expect(state.showRegenerate).toBe(true)
    expect(state.showCommandConfirmation).toBe(false)
  })
})
