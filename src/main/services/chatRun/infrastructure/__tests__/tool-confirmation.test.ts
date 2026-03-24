import { describe, expect, it, vi } from 'vitest'
import { ToolConfirmationManager } from '../tool-confirmation'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'

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
      CHAT_RUN_EVENTS.TOOL_EXEC_REQUIRES_CONFIRMATION,
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
