import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelResponseChunk } from '@main/services/next/runtime/model/ModelResponseChunk'
import type { ModelStreamExecutor } from '@main/services/next/runtime/model/ModelStreamExecutor'
import { DefaultSubagentNextRuntimeRunner } from '../next/SubagentNextRuntimeRunner'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'

const executeMock = vi.fn()

vi.mock('@main/services/agentCore/tools/ToolExecutor', () => ({
  ToolExecutor: class {
    constructor(private readonly config: any) {}

    async execute(calls: Array<{ id: string, index: number, function: string, args: string }>) {
      executeMock(calls)
      const call = calls[0]
      const decision = await this.config.requestConfirmation?.({
        toolCallId: call.id,
        name: call.function,
        args: call.args,
        agent: this.config.confirmationSource,
        ui: {
          command: 'echo legacy',
          riskLevel: 'dangerous',
          reason: 'risky command'
        }
      })

      if (decision && !decision.approved) {
        return [
          {
            id: call.id,
            index: call.index,
            name: call.function,
            content: null,
            cost: 1,
            status: 'aborted',
            error: new Error(decision.reason || 'denied')
          }
        ]
      }

      return [
        {
          id: call.id,
          index: call.index,
          name: call.function,
          content: { ok: true },
          cost: 1,
          status: 'success'
        }
      ]
    }
  }
}))

const createAsyncStream = async function *(
  chunks: ModelResponseChunk[]
): AsyncGenerator<ModelResponseChunk, void, unknown> {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('DefaultSubagentNextRuntimeRunner integration', () => {
  beforeEach(() => {
    executeMock.mockReset()
  })

  it('continues after parent confirmation denied and finishes the run', async () => {
    const requestSpy = vi.spyOn(subagentRuntimeBridge, 'request').mockResolvedValue({
      approved: false,
      reason: 'parent denied',
      args: '{"command":"echo rewritten"}'
    })

    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        const hasToolResult = request.messages.some(message => message.role === 'tool')

        if (hasToolResult) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'test-model',
              content: 'Final summary after denied tool',
              finishReason: 'stop'
            },
            {
              kind: 'final',
              responseId: 'resp-2',
              model: 'test-model'
            }
          ])
        }

        return createAsyncStream([
          {
            kind: 'delta',
            responseId: 'resp-1',
            model: 'test-model',
            toolCalls: [
              {
                argumentsMode: 'snapshot',
                toolCall: {
                  id: 'tool-1',
                  index: 0,
                  type: 'function',
                  function: {
                    name: 'execute_command',
                    arguments: '{"command":"echo original"}'
                  }
                }
              }
            ],
            finishReason: 'tool_calls'
          },
          {
            kind: 'final',
            responseId: 'resp-1',
            model: 'test-model'
          }
        ])
      })
    }

    const runner = new DefaultSubagentNextRuntimeRunner(undefined, {
      modelStreamExecutor
    })

    const result = await runner.run(
      {
        subagentId: 'sub-1',
        task: 'Try execute_command and continue on denial',
        role: 'coder',
        contextMode: 'minimal',
        files: [],
        parentSubmissionId: 'parent-1',
        modelRef: {
          accountId: 'acc-1',
          modelId: 'model-1'
        },
        chatUuid: 'chat-1'
      },
      {
        modelContext: {
          providerDefinition: {
            adapterPluginId: 'test-adapter',
            requestOverrides: {}
          },
          account: {
            id: 'acc-1',
            apiUrl: 'https://example.invalid',
            apiKey: 'test-key'
          },
          model: {
            id: 'test-model',
            type: 'chat',
            label: 'Test Model'
          }
        } as any,
        systemPrompt: 'system prompt',
        userMessage: 'Please run the tool and continue',
        allowedTools: ['execute_command'],
        workspacePath: '/tmp'
      }
    )

    expect(result.summary).toBe('Final summary after denied tool')
    expect(result.artifacts.tools_used).toContain('execute_command')
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(2)
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy.mock.calls[0]?.[0]).toBe('parent-1')
    expect(requestSpy.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      toolCallId: 'tool-1',
      name: 'execute_command',
      ui: expect.objectContaining({
        command: 'echo legacy',
        riskLevel: 'dangerous'
      }),
      agent: expect.objectContaining({
        kind: 'subagent',
        subagentId: 'sub-1',
        role: 'coder'
      })
    }))
    expect(String(requestSpy.mock.calls[0]?.[1]?.args)).toContain('echo original')

    const secondRequest = (modelStreamExecutor.execute as any).mock.calls[1][0].request
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'tool-1',
          name: 'execute_command',
          content: 'parent denied'
        })
      ])
    )
    const firstRuntimeRunInput = (modelStreamExecutor.execute as any).mock.calls[0][0]
    expect(firstRuntimeRunInput.signal).toBeUndefined()

    requestSpy.mockRestore()
  })
})
