import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToolExecutor } from '../ToolExecutor'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'

const {
  handlerMock,
  mcpCallToolMock,
  getToolSourceMock,
  assessExecuteCommandReviewMock
} = vi.hoisted(() => ({
  handlerMock: vi.fn(async (args: any, _context?: unknown) => ({ ok: true, args })),
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
      name === 'schedule'
      || name === 'plan'
      || name === 'activity_journal_append'
      || name === 'subagent'
      || name === 'exec'
      || name === 'wiki'
      || name === 'write'
      || name === 'knowledgebase_search'
      || name === 'run_skill_script'
      || name === 'vision_analyze'
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
  beforeEach(() => {
    handlerMock.mockClear()
  })

  it('passes cancellation and reports bounded output batches from embedded tools', async () => {
    handlerMock.mockImplementationOnce(async (_args: any, context?: any) => {
      context?.onOutput?.({ stream: 'stdout', text: 'hello ' })
      context?.onOutput?.({ stream: 'stdout', text: 'world' })
      context?.onOutput?.({ stream: 'stderr', text: 'warning' })
      return { ok: true, args: _args }
    })
    const controller = new AbortController()
    const progress: any[] = []
    const executor = new ToolExecutor({
      signal: controller.signal,
      onProgress: event => progress.push(event)
    })

    await executor.execute([{
      id: 'call-output',
      function: 'exec',
      args: JSON.stringify({ command: 'echo hello' })
    } as any])

    const context = (handlerMock.mock.calls[0] as any[])[1]
    expect(context.signal).toBe(controller.signal)
    expect(progress).toContainEqual(expect.objectContaining({
      id: 'call-output',
      phase: 'output',
      output: {
        toolCallId: 'call-output',
        sequence: 1,
        chunks: [
          { stream: 'stdout', text: 'hello ' },
          { stream: 'stdout', text: 'world' },
          { stream: 'stderr', text: 'warning' }
        ],
        stdoutBytes: 11,
        stderrBytes: 7
      }
    }))
  })

  it('bounds queued progress payloads during a 100 MiB synchronous output burst', async () => {
    const chunk = 'x'.repeat(64 * 1024)
    const chunkCount = 1_600
    handlerMock.mockImplementationOnce(async (_args: any, context?: any) => {
      for (let index = 0; index < chunkCount; index += 1) {
        context?.onOutput?.({ stream: 'stdout', text: chunk })
      }
      return { ok: true, args: _args }
    })
    const progress: any[] = []
    const executor = new ToolExecutor({
      onProgress: event => progress.push(event)
    })

    await executor.execute([{
      id: 'call-output-stress',
      function: 'exec',
      args: JSON.stringify({ command: 'large-output' })
    } as any])

    const outputEvents = progress.filter(event => event.phase === 'output')
    expect(outputEvents).toHaveLength(1)
    expect(outputEvents[0].output.stdoutBytes).toBe(chunk.length * chunkCount)
    expect(
      outputEvents[0].output.chunks.reduce(
        (total: number, outputChunk: { text: string }) => total + Buffer.byteLength(outputChunk.text),
        0
      )
    ).toBeLessThanOrEqual(64 * 1024)
  })

  it('overrides chat_uuid for schedule tools from runtime context', async () => {
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-1',
      function: 'schedule',
      args: JSON.stringify({
        action: 'create',
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
      function: 'plan',
      args: JSON.stringify({
        action: 'get_current_chat',
        chat_uuid: 'chat-from-llm'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('overrides chat_uuid for vision analyze from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-2b',
      function: 'vision_analyze',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        images: [{ ref: 'message:101#image:1' }],
        prompt: 'read this image'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('overrides model-supplied chat_uuid for embedded file tools', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-file-boundary',
      function: 'write',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        file_path: 'notes.txt',
        content: 'safe'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs.chat_uuid).toBe('chat-runtime')
  })

  it('discards model-supplied chat_uuid when embedded runtime context is absent', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor()

    await executor.execute([{
      id: 'call-file-without-context',
      function: 'write',
      args: JSON.stringify({
        chat_uuid: 'chat-from-llm',
        file_path: 'notes.txt',
        content: 'safe'
      })
    } as any])

    expect(handlerMock).toHaveBeenCalledTimes(1)
    const callArgs = handlerMock.mock.calls[0][0]
    expect(callArgs).not.toHaveProperty('chat_uuid')
  })

  it('treats empty args string as empty object', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-3',
      function: 'plan',
      args: JSON.stringify({ action: 'get_current_chat' })
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
      function: 'exec',
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
      function: 'subagent',
      args: JSON.stringify({
        action: 'spawn',
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

  it('injects chat_uuid for exec from runtime context', async () => {
    handlerMock.mockClear()
    const executor = new ToolExecutor({
      chatUuid: 'chat-runtime'
    })

    await executor.execute([{
      id: 'call-5b',
      function: 'exec',
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
        function: 'exec',
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
      allowedTools: ['plan']
    })

    const [result] = await executor.execute([{
      id: 'call-6',
      function: 'subagent',
      args: JSON.stringify({
        action: 'spawn',
        task: 'Inspect a file'
      })
    } as any])

    expect(result.status).toBe('error')
    expect(result.error?.message).toContain('not allowed')
    expect(handlerMock).not.toHaveBeenCalled()
  })

  it('classifies invalid JSON arguments as input failures', async () => {
    const executor = new ToolExecutor()

    const [result] = await executor.execute([{
      id: 'call-invalid-json',
      function: 'plan',
      args: '{invalid'
    }])

    expect(result.status).toBe('error')
    expect(result.failure).toMatchObject({
      category: 'input',
      code: 'TOOL_ARGUMENTS_INVALID',
      recovery: { action: 'correct_input' }
    })
  })

  it('keeps processor SyntaxError failures internal', async () => {
    handlerMock.mockRejectedValueOnce(new SyntaxError('Invalid JSON in a tool-owned document'))
    const [result] = await new ToolExecutor().execute([{
      id: 'internal-syntax', function: 'plan', args: '{"action":"get_current_chat"}'
    }])
    expect(result.failure).toMatchObject({ category: 'internal', code: 'TOOL_EXECUTION_FAILED' })
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('classifies thrown system errors as environment failures and keeps their code', async () => {
    handlerMock.mockImplementationOnce(async () => {
      const error = new Error('spawn failed') as Error & { code?: string }
      error.code = 'ENOENT'
      throw error
    })
    const executor = new ToolExecutor()

    const [result] = await executor.execute([{
      id: 'call-system-error',
      function: 'plan',
      args: JSON.stringify({ action: 'get_current_chat' })
    }])

    expect(result.status).toBe('error')
    expect(result.failure).toMatchObject({
      category: 'environment',
      code: 'TOOL_ENVIRONMENT_FAILED',
      sourceCode: 'ENOENT'
    })
    expect(result.error).toBeInstanceOf(Error)
  })

  it('carries processor failures through a successful tool execution result', async () => {
    const failure = {
      category: 'policy' as const,
      code: 'PATH_OUTSIDE_WORKSPACE',
      message: 'Path must stay inside the workspace.',
      recovery: {
        action: 'change_strategy' as const,
        message: 'Choose a path inside the workspace.'
      }
    }
    handlerMock.mockResolvedValueOnce(
      { success: false, error: 'legacy error', failure } as unknown as Awaited<ReturnType<typeof handlerMock>>
    )
    const executor = new ToolExecutor()

    const [result] = await executor.execute([{
      id: 'call-structured-result',
      function: 'plan',
      args: JSON.stringify({ action: 'get_current_chat' })
    }])

    expect(result.status).toBe('success')
    expect(result.failure).toEqual(failure)
  })

  it('requires confirmation for plan action=create under strict approval policy', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-7',
      function: 'plan',
      args: JSON.stringify({
        action: 'create',
        goal: 'Ship feature',
        steps: []
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('binds a plan create confirmation to the declared action', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: true,
      args: { action: 'get_current_chat' }
    }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-plan-action-change',
      function: 'plan',
      args: JSON.stringify({ action: 'create', goal: 'Ship feature', steps: [] })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('Submit a new tool call and confirmation')
  })

  it('keeps non-create plan actions on the ordinary execution path', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-7b',
      function: 'plan',
      args: JSON.stringify({ action: 'get_current_chat' })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('auto-approves plan action=create under relaxed approval policy', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      approvalPolicy: { mode: 'relaxed' },
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-8',
      function: 'plan',
      args: JSON.stringify({
        action: 'create',
        goal: 'Ship feature',
        steps: []
      })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
  })

  it('auto-approves plan action=create under session auto approval mode', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      approvalPolicy: { mode: 'strict', permissionApprovalMode: 'auto' },
      requestConfirmation
    })

    await executor.execute([{
      id: 'call-8a',
      function: 'plan',
      args: JSON.stringify({
        action: 'create',
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
      function: 'plan',
      args: JSON.stringify({
        action: 'create',
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
      function: 'exec',
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

  it('auto-approves command app confirmation under session auto approval mode', async () => {
    handlerMock.mockClear()
    assessExecuteCommandReviewMock.mockReturnValueOnce({
      level: 'dangerous',
      reason: 'dangerous command',
      possibleRisk: 'may change files',
      normalizedRiskScore: 8
    })
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'manual denial'
    }))
    const executor = new ToolExecutor({
      approvalPolicy: { mode: 'strict', permissionApprovalMode: 'auto' },
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-8c-auto',
      function: 'exec',
      args: JSON.stringify({
        command: 'rm -rf ./tmp-output',
        execution_reason: 'Clean generated output',
        possible_risk: 'May delete generated files',
        risk_score: 8,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'Deletes a generated folder inside the workspace.'
      })
    } as any])

    expect(assessExecuteCommandReviewMock).toHaveBeenCalled()
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
    expect(handlerMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      confirmed: true
    }))
    expect(result.status).toBe('success')
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
      function: 'exec',
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

  it('requires confirmation when cwd escapes the workspace through parent traversal', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'cwd denied'
    }))
    const executor = new ToolExecutor({
      chatUuid: 'chat-command-cwd',
      workspaceRoot: '/tmp/ati-tool-workspace',
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-cwd-traversal',
      function: 'exec',
      args: JSON.stringify({
        command: 'pwd',
        cwd: '../../etc',
        execution_reason: 'Inspect the selected directory',
        possible_risk: 'Read-only command',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'The command itself reads the current directory.'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const request = (requestConfirmation.mock.calls as any[])[0][0]
    expect(request.ui.inferredFilesystemScope).toBe('outside_workspace')
    expect(request.ui.filesystemReason).toContain('../../etc')
    expect(request.ui.possibleRisk).toContain('../../etc')
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
  })

  it('requires confirmation and summarizes execution-affecting environment overrides', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'environment denied'
    }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-sensitive-env',
      function: 'exec',
      args: JSON.stringify({
        command: 'node ./script.js',
        env: {
          NODE_OPTIONS: '--require ./bootstrap.js',
          PATH: '/custom/bin'
        },
        execution_reason: 'Run the workspace script',
        possible_risk: 'Loads Node.js code',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'The script path is inside the workspace.'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const request = (requestConfirmation.mock.calls as any[])[0][0]
    expect(request.ui.inferredFilesystemScope).toBe('unknown')
    expect(request.ui.filesystemReason).toContain('NODE_OPTIONS, PATH')
    expect(request.ui.possibleRisk).toContain('NODE_OPTIONS, PATH')
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
  })

  it('keeps a workspace-relative cwd on the safe-command path with backend revalidation', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({
      workspaceRoot: '/tmp/ati-tool-workspace',
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-workspace-cwd',
      function: 'exec',
      args: JSON.stringify({
        command: 'pwd',
        cwd: 'src',
        execution_reason: 'Inspect the source directory',
        possible_risk: 'Read-only command',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'The directory is inside the workspace.'
      })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledWith(expect.objectContaining({
      confirmed: false
    }), expect.anything())
    expect(result.status).toBe('success')
  })

  it('requires confirmation when a relative workspace root cannot prove cwd containment', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'relative root denied'
    }))
    const executor = new ToolExecutor({
      workspaceRoot: './workspaces/chat-1',
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-relative-workspace-root',
      function: 'exec',
      args: JSON.stringify({
        command: 'pwd',
        cwd: 'src',
        execution_reason: 'Inspect the source directory',
        possible_risk: 'Read-only command',
        risk_score: 0,
        filesystem_scope: 'workspace',
        filesystem_scope_reason: 'The directory is expected inside the workspace.'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const request = (requestConfirmation.mock.calls as any[])[0][0]
    expect(request.ui.inferredFilesystemScope).toBe('unknown')
    expect(request.ui.filesystemReason).toContain('workspace root is unavailable')
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
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
      function: 'exec',
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

  it('requires confirmation for dangerous tools from embedded metadata', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'wiki deletion denied'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-10',
      function: 'wiki',
      args: JSON.stringify({
        action: 'delete',
        name: 'release-notes'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const firstRequest = (requestConfirmation.mock.calls[0] as any[])[0]
    expect(firstRequest.ui).toEqual(expect.objectContaining({
      title: 'Confirm wiki',
      riskLevel: 'dangerous',
      riskScore: 8
    }))
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('wiki deletion denied')
  })

  it('requires confirmation for wiki write actions from embedded metadata', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: false, reason: 'wiki write denied' }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-wiki-write',
      function: 'wiki',
      args: JSON.stringify({ action: 'write', name: 'release-notes', content: 'Draft notes.' })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect((requestConfirmation.mock.calls[0] as any[])[0].ui).toEqual(expect.objectContaining({
      title: 'Confirm wiki',
      riskLevel: 'risky',
      riskScore: 5
    }))
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
  })

  it('binds a wiki write confirmation to the declared action', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: true,
      args: { action: 'delete', name: 'release-notes' }
    }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-wiki-action-change',
      function: 'wiki',
      args: JSON.stringify({ action: 'write', name: 'release-notes', content: 'Draft notes.' })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('Submit a new tool call and confirmation')
  })

  it('runs same-action wiki confirmation replacements with runtime context', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: true,
      args: { action: 'write', name: 'release-notes', content: 'Approved replacement.' }
    }))
    const executor = new ToolExecutor({
      chatUuid: 'chat-wiki-replacement',
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-wiki-same-action',
      function: 'wiki',
      args: JSON.stringify({ action: 'write', name: 'release-notes', content: 'Draft notes.' })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'write',
      name: 'release-notes',
      content: 'Approved replacement.',
      chat_uuid: 'chat-wiki-replacement'
    }), expect.anything())
    expect(result.status).toBe('success')
  })

  it('requires confirmation for workspace mutations from embedded metadata', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'write denied'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-11',
      function: 'write',
      args: JSON.stringify({
        path: 'notes.md',
        content: 'hello'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    const firstRequest = (requestConfirmation.mock.calls[0] as any[])[0]
    expect(firstRequest.ui).toEqual(expect.objectContaining({
      title: 'Confirm write',
      riskLevel: 'risky',
      riskScore: 5
    }))
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('write denied')
  })

  it.each(['list', 'read', 'search'])('executes wiki %s without confirmation', async (action) => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: false, reason: 'manual denial' }))
    const executor = new ToolExecutor({ requestConfirmation })
    const args = action === 'search'
      ? { action, query: 'release notes', localized_query: 'release notes' }
      : action === 'read'
        ? { action, name: 'release-notes' }
        : { action }

    const [result] = await executor.execute([{
      id: `call-wiki-${action}`,
      function: 'wiki',
      args: JSON.stringify(args)
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('success')
  })

  it('does not require confirmation for non-mutating warning tools from embedded metadata', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'manual denial'
    }))
    const executor = new ToolExecutor({
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-11b',
      function: 'knowledgebase_search',
      args: JSON.stringify({
        query: 'wiki',
        localized_query: 'wiki'
      })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('success')
  })

  it('requires trusted metadata confirmation for skill scripts even when model args claim confirmation', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'skill script denied'
    }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-skill-script-denied',
      function: 'run_skill_script',
      args: JSON.stringify({
        name: 'amap',
        script: 'scripts/amap.ts',
        confirmed: true
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).not.toHaveBeenCalled()
    expect(result.status).toBe('aborted')
    expect(result.error?.message).toContain('skill script denied')
  })

  it('passes trusted metadata approval to the skill script execution context', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({ approved: true }))
    const executor = new ToolExecutor({ requestConfirmation })

    const [result] = await executor.execute([{
      id: 'call-skill-script-approved',
      function: 'run_skill_script',
      args: JSON.stringify({
        name: 'amap',
        script: 'scripts/amap.ts'
      })
    } as any])

    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(handlerMock).toHaveBeenCalledTimes(1)
    expect(handlerMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      metadataConfirmationApproved: true
    }))
    expect(result.status).toBe('success')
  })

  it('auto-approves metadata confirmations under session auto approval mode', async () => {
    handlerMock.mockClear()
    const requestConfirmation = vi.fn(async () => ({
      approved: false,
      reason: 'manual denial'
    }))
    const executor = new ToolExecutor({
      approvalPolicy: { mode: 'strict', permissionApprovalMode: 'auto' },
      requestConfirmation
    })

    const [result] = await executor.execute([{
      id: 'call-12',
      function: 'wiki',
      args: JSON.stringify({
        action: 'delete',
        name: 'release-notes'
      })
    } as any])

    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(handlerMock).toHaveBeenCalledTimes(1)
    expect(handlerMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      metadataConfirmationApproved: true
    }))
    expect(result.status).toBe('success')
  })
})
