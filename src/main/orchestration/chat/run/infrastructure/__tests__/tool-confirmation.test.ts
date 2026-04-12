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
})
