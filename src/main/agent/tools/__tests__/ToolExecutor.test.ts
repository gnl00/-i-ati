import { describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../ToolExecutor'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

const {
  handlerMock,
  mcpCallToolMock,
  getToolSourceMock,
  assessExecuteCommandReviewMock
} = vi.hoisted(() => ({
  handlerMock: vi.fn(async (args: any) => ({ ok: true, args })),
  mcpCallToolMock: vi.fn(async () => [{ ok: true }]),
  getToolSourceMock: vi.fn(() => undefined as 'mcp' | undefined),
  assessExecuteCommandReviewMock: vi.fn(() => ({
    level: 'safe',
    reason: 'safe',
    possibleRisk: '',
    normalizedRiskScore: 0
  }))
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    isRegistered: vi.fn((name: string) => (
      name === 'schedule_create'
      || name === 'plan_get_current_chat'
      || name === 'plan_create'
      || name === 'activity_journal_append'
      || name === 'subagent_spawn'
      || name === 'execute_command'
    )),
    getHandler: vi.fn(() => handlerMock)
  }
}))

vi.mock('@main/services/mcpRuntime', () => ({
  mcpRuntimeService: {
    callTool: mcpCallToolMock,
    getToolSource: getToolSourceMock
  }
}))

vi.mock('@main/tools/command/risk', () => ({
  assessExecuteCommandReview: assessExecuteCommandReviewMock
}))

describe('ToolExecutor runtime context', () => {
  it('overrides chat_uuid for schedule tools from runtime context', async () => {
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-1',
      function: 'schedule_create',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        goal: 'goal',
        run_at: '2026-02-06T18:00:00+08:00'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('overrides chat_uuid for plan tools from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-2',
      function: 'plan_get_current_chat',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('treats empty args string as empty object', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-3',
      function: 'plan_get_current_chat',
      args: ''
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('preserves escaped tool string arguments before execution', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor()

    await executor.execute([{
      id: 'call-3b',
      function: 'execute_command',
      args: JSON.stringify({
        command: 'printf "hello\\nworld"',
        execution_reason: 'Check escaping',
        possible_risk: 'Low risk',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Runs inside the workspace.',
        metadata: {
          note: 'line1\\nline2'
        }
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.command).toBe('printf "hello\\nworld"')
    expect(callArgs.metadata.note).toBe('line1\\nline2')
  })

  it('overrides chat_uuid for activity journal tools from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-4',
      function: 'activity_journal_append',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        title: 'Finished step',
        category: 'summary'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('injects model_ref for subagent tools from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime',
      submissionId: 'submission-runtime',
      modelRef: {
        accountId: 'acc-1',
        modelId: 'model-1'
      }
    })

    await executor.execute([{
      id: 'call-5',
      function: 'subagent_spawn',
      args: JSON.stringify({
        task: 'Inspect a file'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
    expect(callArgs.model_ref).toEqual({
      accountId: 'acc-1',
      modelId: 'model-1'
    })
    expect(callArgs.parent_submission_id).toBe('submission-runtime')
  })

  it('injects chat_uuid for execute_command from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-5b',
      function: 'execute_command',
      args: JSON.stringify({
        command: 'pwd',
        execution_reason: 'Check working directory',
        possible_risk: 'Low risk',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Reads the current workspace directory.'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('keeps mcp tool arguments free of injected chat_uuid', async () => {
    handlerMock.mockClear()
    mcpCallToolMock.mockClear()
    getToolSourceMock.mockReturnValueOnce('mcp')

    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-5c',
      function: 'mcp_echo',
      args: JSON.stringify({
        text: 'hello'
      })
    } as any])

    expect(mcpCallToolMock).toHaveBeenCalledTimes(1)
    const firstCall = mcpCallToolMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    const callArgs = firstCall[2]
    expect(callArgs).toEqual({
      text: 'hello'
    })
  })

  it('strips tool_call_reason before embedded and mcp execution', async () => {
    handlerMock.mockClear()
    mcpCallToolMock.mockClear()
    getToolSourceMock.mockReturnValueOnce('mcp')

    const executor = new ToolExecutor()

    await executor.execute([
      {
        id: 'call-5d',
        function: 'execute_command',
        args: JSON.stringify({
          command: 'pwd',
          execution_reason: 'Check working directory',
          possible_risk: 'Low risk',
          risk_score: 0,
          filesystem_scope: 'workspace',
          filesystem_scope_reason: 'Reads the current workspace directory.',
          [TOOL_CALL_REASON_PARAMETER_NAME]: 'Need to inspect the active working directory.'
        })
      } as any,
      {
        id: 'call-5e',
        function: 'mcp_echo',
        args: JSON.stringify({
          text: 'hello',
          [TOOL_CALL_REASON_PARAMETER_NAME]: 'Need to echo text through the MCP server.'
        })
      } as any
    ])

    expect(handlerMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      command: 'pwd',
      execution_reason: 'Check working directory'
    }))
    expect(handlerMock.mock.calls[0][0]).not.toHaveProperty(TOOL_CALL_REASON_PARAMETER_NAME)
    const mcpCall = mcpCallToolMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    expect(mcpCall[2]).toEqual({
      text: 'hello'
    })
  })

  it('rejects tools that are not allowed in the current runtime', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      allowedTools: ['plan_get_current_chat']
    })

    const [result] = await executor.execute([{
      id: 'call-6',
      function: 'subagent_spawn',
      args: JSON.stringify({
        task: 'Inspect a file'
      })
    } as any])

    expect(result.status).toBe('error')
    expect(result.error?.message).toContain('not allowed')
    expect(handlerMock).not.toHaveBeenCalled()
  })

  it('requires confirmation for plan_create under strict approval policy', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-7',
      function: 'plan_create',
      args: JSON.stringify({
        goal: 'Ship feature',
        steps: []
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('auto-approves plan_create under relaxed approval policy', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      approvalPolicy: { mode: 'relaxed' },
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-8',
      function: 'plan_create',
      args: JSON.stringify({
        goal: 'Ship feature',
        steps: []
      })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('returns an aborted error result when confirmation is rejected', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'Denied by reviewer'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-8b',
      function: 'plan_create',
      args: JSON.stringify({
        goal: 'Ship feature',
        steps: []
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.content).toBeNull()
    expect(result.error?.name).toBe('AbortError')
    expect(result.error?.message).toContain('Denied by reviewer')
  })

  it('returns an aborted command result when confirmation is cancelled', async () => {
    handlerMock.mockClear()
    assessExecuteCommandReviewMock.mockReturnValueOnce({
      level: 'warning',
      reason: 'Redirecting to /dev/null',
      possibleRisk: 'May hide output',
      normalizedRiskScore: 4
    })
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'user_cancelled'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-8c',
      function: 'execute_command',
      args: JSON.stringify({
        command: 'echo secret > /dev/null',
        execution_reason: 'Verify command',
        possible_risk: 'May hide output',
        risk_score: 4
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.id).toBe('call-8c')
    expect(result.error?.message).toContain('user_cancelled')
  })

  it('requires confirmation for outside workspace filesystem access even with low command risk', async () => {
    handlerMock.mockClear()
    assessExecuteCommandReviewMock.mockReturnValueOnce({
      level: 'safe',
      reason: 'safe',
      possibleRisk: 'Read-only command',
      normalizedRiskScore: 0
    })
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'outside workspace denied'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-8d',
      function: 'execute_command',
      args: JSON.stringify({
        command: 'cat ~/.zshrc',
        execution_reason: 'Inspect shell config',
        possible_risk: 'Read-only command',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'The model expected a read-only command.'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const request = (requestConfirmation.mock.calls as any[])[0][0]
    expect(request.ui.filesystemScope).toBe('workspace')
    expect(request.ui.inferredFilesystemScope).toBe('outside_workspace')
    expect(request.ui.filesystemReason).toContain('home directory')
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('outside workspace denied')
  })

  it('passes confirmation source metadata to manual reviews', async () => {
    handlerMock.mockClear()
    assessExecuteCommandReviewMock.mockReturnValueOnce({
      level: 'warning',
      reason: 'needs review',
      possibleRisk: 'may change files',
      normalizedRiskScore: 4
    })

    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      requestConfirmation,
      confirmationSource: {
        kind: 'subagent',
        role: 'coder',
        task: 'Inspect and patch the file'
      }
    })

    await executor.execute([{
      id: 'call-9',
      function: 'execute_command',
      args: JSON.stringify({
        command: 'npm test',
        execution_reason: 'Run tests',
        possible_risk: 'May take time',
        risk_score: 4
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const firstCall = requestConfirmation.mock.calls[0] as any[] | undefined
    const firstRequest = firstCall?.[0] as { agent?: unknown } | undefined
    expect(firstRequest?.agent).toEqual({
      kind: 'subagent',
      role: 'coder',
      task: 'Inspect and patch the file'
    })
  })
})
