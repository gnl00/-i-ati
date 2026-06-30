import { describe, expect, it, vi } from 'vitest'
import { ToolConfirmationManager } from '../tool-confirmation'
import { RUN_EVENTS } from '@shared/run/events'

describe('ToolConfirmationManager', () => {
  it('emits confirmation events with agent metadata', async () => {
    const manager = new ToolConfirmationManager()
    const emit = vi.fn()

    void manager.request(
      {
        emit
      } as any,
      {
        toolCallId: 'call-1',
        name: 'execute_command',
        args: { command: 'rm -rf demo.txt' },
        agent: {
          kind: 'subagent',
          subagentId: 'sub-1',
          role: 'coder',
          task: 'delete a file'
        },
        ui: {
          command: 'rm -rf demo.txt',
          riskLevel: 'dangerous'
        }
      }
    )

    expect(emit).toHaveBeenCalledWith(
      RUN_EVENTS.TOOL_CONFIRMATION_REQUIRED,
      expect.objectContaining({
        toolCallId: 'call-1',
        name: 'execute_command',
        args: { command: 'rm -rf demo.txt' },
        agent: expect.objectContaining({
          kind: 'subagent',
          subagentId: 'sub-1',
          role: 'coder',
          task: 'delete a file'
        }),
        ui: expect.objectContaining({
          command: 'rm -rf demo.txt',
          riskLevel: 'dangerous'
        })
      })
    )
  })

  it('resolves pending confirmations for a cancelled submission', async () => {
    const manager = new ToolConfirmationManager()
    const emit = vi.fn()

    const decisionPromise = manager.request(
      {
        submissionId: 'submission-1',
        emit
      } as any,
      {
        toolCallId: 'call-1',
        name: 'execute_command'
      }
    )

    manager.cancelForSubmission('submission-1', 'user_cancelled')

    await expect(decisionPromise).resolves.toEqual({
      approved: false,
      reason: 'user_cancelled'
    })
  })

  it('keeps pending confirmations for other submissions', async () => {
    const manager = new ToolConfirmationManager()
    const emit = vi.fn()
    let settled = false

    const decisionPromise = manager.request(
      {
        submissionId: 'submission-1',
        emit
      } as any,
      {
        toolCallId: 'call-1',
        name: 'execute_command'
      }
    ).then(() => {
      settled = true
    })

    manager.cancelForSubmission('submission-2', 'user_cancelled')
    await Promise.resolve()

    expect(settled).toBe(false)
    manager.resolve('call-1', { approved: false, reason: 'cleanup' })
    await decisionPromise
  })

  it('approves pending confirmations for a submission', async () => {
    const manager = new ToolConfirmationManager()
    const emit = vi.fn()

    const decisionPromise = manager.request(
      {
        submissionId: 'submission-1',
        emit
      } as any,
      {
        toolCallId: 'call-1',
        name: 'execute_command'
      }
    )

    manager.approvePendingForSubmission('submission-1')

    await expect(decisionPromise).resolves.toEqual({
      approved: true,
      reason: 'permission_approval_mode_auto'
    })
  })
})
