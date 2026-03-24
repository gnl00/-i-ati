import { describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../ToolExecutor'

const { handlerMock, assessExecuteCommandReviewMock } = vi.hoisted(() => ({
  handlerMock: vi.fn(async (args: any) => ({ ok: true, args })),
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
    callTool: vi.fn()
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
        risk_score: 0
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
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
