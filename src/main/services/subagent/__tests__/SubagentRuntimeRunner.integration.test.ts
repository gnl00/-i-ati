import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelResponseChunk } from '@main/agent/runtime/model/ModelResponseChunk'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import { DefaultSubagentRuntimeRunner, type PreparedSubagentRunContext } from '../runtime/SubagentRuntimeRunner'
import { subagentRuntimeBridge } from '../subagent-runtime-bridge'

const executeMock = vi.fn()

vi.mock('electron', () => ({
  app: {
    isReady: () => false,
    getPath: () => '/tmp'
  },
  BrowserWindow: class {},
  shell: {
    openExternal: vi.fn()
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  session: {}
}))

vi.mock('@main/main-window', () => ({
  mainWindow: {
    webContents: {
      send: vi.fn()
    }
  },
  getMainWindow: vi.fn(() => null)
}))

vi.mock('@main/agent/tools/ToolExecutor', () => ({
  ToolExecutor: class {
    constructor(private readonly config: any) {}

    async execute(calls: Array<{ id: string; index: number; function: string; args: string }>) {
      executeMock(calls, this.config.signal)
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

const createAsyncStream = async function* (
  chunks: ModelResponseChunk[]
): AsyncGenerator<ModelResponseChunk, void, unknown> {
  for (const chunk of chunks) {
    yield chunk
  }
}

describe('DefaultSubagentRuntimeRunner integration', () => {
  it('cancels the model stream and preserves bounded partial output', async () => {
    const controller = new AbortController()
    let streamed!: () => void
    const started = new Promise<void>(resolve => { streamed = resolve })
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ signal }) => (async function* (): AsyncGenerator<ModelResponseChunk, void, unknown> {
        yield { kind: 'delta' as const, content: 'Partial investigation evidence.' }
        streamed()
        await new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
          if (signal?.aborted) reject(signal.reason)
        })
      })())
    }
    const runner = new DefaultSubagentRuntimeRunner(undefined, { modelStreamExecutor })
    const running = runner.run({
      subagentId: 'stream-cancel', task: 'inspect', role: 'researcher', contextMode: 'minimal', files: [],
      signal: controller.signal, modelRef: { accountId: 'a', modelId: 'm' }
    }, {
      modelContext: {
        providerDefinition: { adapterPluginId: 'test-adapter' },
        account: { apiUrl: 'https://example.invalid', apiKey: 'test' },
        model: { id: 'test-model', type: 'chat' }
      } as unknown as PreparedSubagentRunContext['modelContext'],
      systemPrompt: 'inspect', userMessage: 'inspect', allowedTools: [], workspacePath: '/tmp'
    })
    await started
    controller.abort(new DOMException('User stopped', 'AbortError'))
    expect(await running).toMatchObject({ status: 'cancelled', summary: 'Partial investigation evidence.' })
    expect(modelStreamExecutor.execute).toHaveBeenCalledOnce()
    expect(executeMock).not.toHaveBeenCalled()
  })

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
        const hasToolResult = request.messages.some((message) => message.role === 'tool')

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
                    name: 'exec',
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

    const runner = new DefaultSubagentRuntimeRunner(undefined, {
      modelStreamExecutor
    })

    const controller = new AbortController()
    const result = await runner.run(
      {
        subagentId: 'sub-1',
        signal: controller.signal,
        task: 'Try exec and continue on denial',
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
        allowedTools: ['exec'],
        workspacePath: '/tmp'
      }
    )

    expect(result.summary).toBe('Final summary after denied tool')
    expect(result.artifacts.tools_used).toContain('exec')
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(2)
    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy.mock.calls[0]?.[0]).toBe('parent-1')
    expect(requestSpy.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        toolCallId: 'tool-1',
        name: 'exec',
        ui: expect.objectContaining({
          command: 'echo legacy',
          riskLevel: 'dangerous'
        }),
        agent: expect.objectContaining({
          kind: 'subagent',
          subagentId: 'sub-1',
          role: 'coder'
        })
      })
    )
    expect(String(requestSpy.mock.calls[0]?.[1]?.args)).toContain('echo original')

    const secondRequest = (modelStreamExecutor.execute as any).mock.calls[1][0].request
    expect(secondRequest.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'tool-1',
          toolName: 'exec',
          content: '[Tool status: aborted]\nparent denied'
        })
      ])
    )
    const firstRuntimeRunInput = (modelStreamExecutor.execute as any).mock.calls[0][0]
    expect(firstRuntimeRunInput.signal).toBe(controller.signal)
    expect(executeMock.mock.calls[0][1]).toBe(controller.signal)

    requestSpy.mockRestore()
  })
  it('includes already queued information alongside the task before the first model request', async () => {
    const messages = [{ queueItemId: 'queued-message', text: 'Preserve existing changes.', imageUrls: [], content: [{ type: 'input_text' as const, text: 'Preserve existing changes.' }] }]
    const acknowledge = vi.fn()
    const modelStreamExecutor: ModelStreamExecutor = { execute: vi.fn(async () => createAsyncStream([
      { kind: 'delta', content: 'Reviewed queued information.', finishReason: 'stop' }, { kind: 'final' }
    ])) }
    const runner = new DefaultSubagentRuntimeRunner(undefined, { modelStreamExecutor })
    await runner.run({ task: 'initial task', role: 'researcher', files: [], contextMode: 'minimal', modelRef: { accountId: 'a', modelId: 'm' }, steeringMessageSource: { take: () => messages.shift(), acknowledge } }, {
      modelContext: { providerDefinition: { adapterPluginId: 'test-adapter' }, account: { apiUrl: 'https://example.invalid', apiKey: 'test' }, model: { id: 'test-model', type: 'chat' } } as unknown as PreparedSubagentRunContext['modelContext'],
      systemPrompt: 'worker', userMessage: 'initial task', allowedTools: [], workspacePath: '/tmp'
    })
    expect(acknowledge).toHaveBeenCalledExactlyOnceWith('queued-message')
    const call = vi.mocked(modelStreamExecutor.execute).mock.calls[0][0]
    expect(JSON.stringify(call.request.messages)).toContain('initial task')
    expect(JSON.stringify(call.request.messages)).toContain('Preserve existing changes.')
    expect(executeMock).not.toHaveBeenCalled()
  })

})
