import { describe, expect, it, vi } from 'vitest'
import { createSubagentConfirmationRequester } from '../runtime/SubagentRuntimeRunner'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'

describe('DefaultSubagentRuntimeRunner', () => {
  it('preserves confirmation ui and rewritten args through parent bridge', async () => {
    const requestSpy = vi.spyOn(subagentRuntimeBridge, 'request').mockResolvedValue({
      approved: true,
      reason: 'approved',
      args: '{"command":"echo rewritten"}'
    })

    const runtimeInput = {
      subagentId: 'sub-1',
      task: 'run command',
      role: 'coder',
      contextMode: 'minimal' as const,
      files: [],
      parentSubmissionId: 'parent-1',
      modelRef: {
        accountId: 'acc-1',
        modelId: 'model-1'
      },
      chatUuid: 'chat-1'
    }

    const requestConfirmation = createSubagentConfirmationRequester(runtimeInput)
    if (!requestConfirmation) {
      throw new Error('Expected confirmation requester')
    }

    const decision = await requestConfirmation({
      toolCallId: 'tool-1',
      name: 'execute_command',
      args: '{"command":"echo original"}',
      ui: {
        command: 'echo original',
        riskLevel: 'dangerous'
      }
    })

    expect(requestSpy).toHaveBeenCalledWith('parent-1', {
      toolCallId: 'tool-1',
      name: 'execute_command',
      args: '{"command":"echo original"}',
      ui: {
        command: 'echo original',
        riskLevel: 'dangerous'
      },
      agent: {
        kind: 'subagent',
        subagentId: 'sub-1',
        role: 'coder',
        task: 'run command'
      }
    })
    expect(decision).toEqual({
      approved: true,
      reason: 'approved',
      args: '{"command":"echo rewritten"}'
    })

    requestSpy.mockRestore()
  })

  it('denies confirmation by default when no parent submission channel exists', async () => {
    const requestConfirmation = createSubagentConfirmationRequester({
      subagentId: 'sub-2',
      role: 'coder',
      task: 'run command without parent',
      parentSubmissionId: undefined
    })

    if (!requestConfirmation) {
      throw new Error('Expected confirmation requester')
    }

    await expect(requestConfirmation({
      toolCallId: 'tool-2',
      name: 'execute_command',
      args: '{"command":"echo hi"}'
    })).resolves.toEqual({
      approved: false,
      reason: 'Subagent confirmation flow is not enabled in phase one.'
    })
  })
})
