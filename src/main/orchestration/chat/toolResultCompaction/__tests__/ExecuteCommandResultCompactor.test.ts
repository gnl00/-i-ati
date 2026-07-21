import { describe, expect, it, vi } from 'vitest'
import { ExecuteCommandResultCompactor } from '../ExecuteCommandResultCompactor'

describe('ExecuteCommandResultCompactor', () => {
  it('uses CompactAgent and preserves command execution facts', async () => {
    const compactAgent = {
      compact: vi.fn(async (_input: unknown) => ({
        content: '[stdout] 82 tests passed.\n[stderr] warning in src/main/index.ts:42',
        usage: {
          promptTokens: 220,
          completionTokens: 30,
          totalTokens: 250
        },
        modelId: 'lite-model',
        latencyMs: 40,
        promptVersion: 'command-output-v1',
        truncated: false
      }))
    }
    const output = await new ExecuteCommandResultCompactor(compactAgent).compact({
      messageId: 20,
      toolName: 'renamed_command_tool',
      toolCallId: 'call-command',
      args: { command: 'pnpm test' },
      status: 'success',
      rawContent: {
        success: true,
        command: 'pnpm test',
        stdout: 'test output '.repeat(500),
        stderr: 'warning output',
        stdout_bytes: 6_000,
        stderr_bytes: 14,
        stdout_truncated: true,
        stderr_truncated: false,
        exit_code: 0,
        termination_signal: 'SIGTERM',
        execution_time: 1350
      },
      level: 'balanced'
    })

    const compact = JSON.parse(output.content)
    expect(compact).toMatchObject({
      success: true,
      command: 'pnpm test',
      exit_code: 0,
      termination_signal: 'SIGTERM',
      execution_time: 1350,
      stdout_bytes: 6_000,
      stderr_bytes: 14,
      stdout_truncated: true,
      stderr_truncated: false,
      output_summary: expect.stringContaining('82 tests passed'),
      truncation: {
        compactionTruncated: true
      }
    })
    expect(output).toMatchObject({
      compactorId: 'command-output',
      compactorVersion: 1,
      execution: {
        executionType: 'model',
        modelId: 'lite-model',
        promptTokens: 220,
        completionTokens: 30,
        latencyMs: 40
      }
    })
    expect(compactAgent.compact).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('[stdout]'),
      contentType: 'command-execution-output',
      profile: 'command-execute-result',
      maxCharacters: 1_000,
      maxInputCharacters: 12_000,
      sensitiveDataPolicy: 'redact-secrets',
      promptVersion: 'command-output-v1'
    }))
  })

  it('uses deterministic minimal fallback and preserves failure details', async () => {
    const compactAgent = {
      compact: async (): Promise<never> => {
        throw new Error('model timeout')
      }
    }
    const output = await new ExecuteCommandResultCompactor(compactAgent).compact({
      messageId: 21,
      toolName: 'execute_command',
      status: 'error',
      rawContent: {
        success: false,
        command: 'pnpm build',
        stdout: 'build output '.repeat(200),
        stderr: 'TypeScript error '.repeat(200),
        exit_code: 2,
        execution_time: 800,
        error: 'Command failed'
      },
      level: 'minimal'
    })

    const compact = JSON.parse(output.content)
    expect(compact).toMatchObject({
      success: false,
      command: 'pnpm build',
      exit_code: 2,
      execution_time: 800,
      error: 'Command failed'
    })
    expect(compact.output_summary).toContain('[command output compacted]')
    expect(compact.output_summary.length).toBeLessThanOrEqual(500)
    expect(output.execution).toMatchObject({
      executionType: 'deterministic',
      promptVersion: 'command-output-v1'
    })
  })

  it('bounds verbose command output before calling the model', async () => {
    const compactAgent = {
      compact: vi.fn(async (_input: unknown) => ({
        content: 'tests passed',
        modelId: 'lite-model',
        latencyMs: 4,
        promptVersion: 'command-output-v1',
        truncated: false,
        sentCharacters: 12_000,
        inputTruncated: false,
        redactionCount: 0
      }))
    }
    const output = await new ExecuteCommandResultCompactor(compactAgent).compact({
      messageId: 22,
      toolName: 'execute_command',
      status: 'success',
      rawContent: {
        command: 'pnpm test',
        stdout: 'verbose output '.repeat(10_000),
        stderr: '',
        exit_code: 0
      },
      level: 'balanced',
      modelInputPolicy: 'redact-secrets'
    })

    const modelInput = compactAgent.compact.mock.calls[0]?.[0] as
      | { content?: string }
      | undefined
    expect(Array.from(modelInput?.content ?? '')).toHaveLength(12_000)
    expect(modelInput?.content).toContain('[command source pre-compacted]')
    expect(modelInput?.content).toContain('"command":"pnpm test"')
    expect(output.execution).toMatchObject({
      inputTruncated: true,
      sentCharacters: 12_000
    })
  })
})
