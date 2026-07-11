import { describe, expect, it } from 'vitest'
import { buildCommandConfirmationRequest } from '../commandConfirmationPresenter'

describe('buildCommandConfirmationRequest', () => {
  it('builds command confirmation request from confirmation ui metadata', () => {
    const request = buildCommandConfirmationRequest({
      pendingToolConfirm: {
        toolCallId: 'call-1',
        name: 'execute_command',
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

    expect(request).toMatchObject({
      command: 'rm -rf /tmp/x',
      risk_level: 'dangerous',
      execution_reason: 'Need cleanup',
      possible_risk: 'Deletes files',
      risk_score: 9,
      pending_count: 2
    })
  })

  it('falls back to command args and default copy', () => {
    const request = buildCommandConfirmationRequest({
      pendingToolConfirm: {
        toolCallId: 'call-1',
        name: 'execute_command',
        args: {
          command: 'pwd'
        }
      },
      pendingToolConfirmCount: 1
    })

    expect(request).toMatchObject({
      command: 'pwd',
      risk_level: 'risky',
      execution_reason: 'Command requires approval',
      possible_risk: 'Potential risk not provided',
      pending_count: 1
    })
  })

  it('returns undefined without a pending confirmation request', () => {
    const request = buildCommandConfirmationRequest({
      pendingToolConfirm: null,
      pendingToolConfirmCount: 0
    })

    expect(request).toBeUndefined()
  })
})
