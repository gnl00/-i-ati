import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelResponseChunk } from '@main/agent/runtime/model/ModelResponseChunk'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import { RUN_EVENTS } from '@shared/run/events'
import { DefaultMainAgentRuntimeRunner } from '../DefaultMainAgentRuntimeRunner'

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

const { saveMessageMock } = vi.hoisted(() => ({
  saveMessageMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveMessage: saveMessageMock,
    updateChat: vi.fn(),
    saveRunEvent: vi.fn()
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
  }
}))

const executeMock = vi.fn()

vi.mock('@main/agent/tools', () => ({
  ToolExecutor: class {
    async execute(calls: Array<{ id: string; index?: number; function: string; args: string }>) {
      executeMock(calls)
      const call = calls[0]
      return [{
        id: call.id || 'tool-1',
        index: call.index ?? 0,
        name: call.function,
        content: { ok: true },
        cost: 1,
        status: 'success' as const
      }]
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

const input = {
  submissionId: 'submission-1',
  chatId: 1,
  chatUuid: 'chat-1',
  modelRef: { accountId: 'account-1', modelId: 'model-1' },
  input: {
    textCtx: 'hello',
    mediaCtx: [],
    stream: true
  }
} as any

const prepared = {
  runSpec: {
    submissionId: 'submission-1',
    modelContext: {
      model: { id: 'model-1', label: 'model-1', type: 'llm' },
      account: {
        id: 'account-1',
        providerId: 'provider-1',
        apiUrl: 'https://example.com',
        apiKey: 'key',
        models: []
      },
      providerDefinition: {
        id: 'provider-1',
        adapterPluginId: 'openai-chat-compatible-adapter'
      }
    },
    request: {
      model: 'model-1',
      messages: [],
      stream: true
    },
    initialMessages: [],
    runtimeContext: {
      chatId: 1,
      chatUuid: 'chat-1',
      workspacePath: './workspaces/chat-1'
    }
  },
  chatContext: {
    chat: {
      id: 1,
      uuid: 'chat-1',
      title: 'NewChat',
      messages: [],
      modelRef: {
        accountId: 'account-1',
        modelId: 'model-1'
      },
      workspacePath: './workspaces/chat-1',
      userInstruction: '',
      createTime: 1,
      updateTime: 1
    },
    workspacePath: './workspaces/chat-1',
    messageEntities: [{
      id: 102,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }],
    assistantPlaceholder: {
      id: 102,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: []
      }
    }
  }
} as any

describe('DefaultMainAgentRuntimeRunner integration', () => {
  beforeEach(() => {
    saveMessageMock.mockReset()
    saveMessageMock.mockReturnValue(301)
    executeMock.mockReset()
  })

  it('keeps assistant text visible for a completed step that also contains tool calls', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              content: 'Done after tool',
              finishReason: 'stop'
            },
            {
              kind: 'final',
              responseId: 'resp-2',
              model: 'model-1'
            }
          ])
        }

        return createAsyncStream([
          {
            kind: 'delta',
            responseId: 'resp-1',
            model: 'model-1',
            content: 'Let me inspect that first.',
            toolCalls: [{
              argumentsMode: 'snapshot',
              toolCall: {
                id: 'tool-1',
                index: 0,
                type: 'function',
                function: {
                  name: 'read',
                  arguments: '{"path":"README.md"}'
                }
              }
            }],
            finishReason: 'tool_calls'
          },
          {
            kind: 'final',
            responseId: 'resp-1',
            model: 'model-1'
          }
        ])
      })
    }

    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    const result = await runner.run({
      runInput: input,
      prepared,
      emitter,
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(result.runtimeResult.state).toBe('completed')
    expect(result.stepCommitter.getFinalAssistantMessage().body.content).toBe(
      'Let me inspect that first.\n\nDone after tool'
    )
    const textSegments = result.stepCommitter
      .getFinalAssistantMessage()
      .body.segments
      .filter((segment): segment is TextSegment => segment.type === 'text')
    expect(textSegments.map(segment => segment.content)).toEqual([
      'Let me inspect that first.',
      'Done after tool'
    ])
    expect(
      emitter.emit.mock.calls.some(([type, payload]) => (
        type === RUN_EVENTS.MESSAGE_SEGMENT_UPDATED
        && payload?.messageId === 102
        && payload?.patch?.segment?.type === 'text'
        && payload?.patch?.segment?.content === 'Let me inspect that first.'
      ))
    ).toBe(true)
  })

  it('forwards unified host render events to injected host sinks', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => createAsyncStream([
        {
          kind: 'delta',
          responseId: 'resp-1',
          model: 'model-1',
          content: 'Thinking',
          toolCalls: [{
            argumentsMode: 'snapshot',
            toolCall: {
              id: 'tool-1',
              index: 0,
              type: 'function',
              function: {
                name: 'read',
                arguments: '{"path":"README.md"}'
              }
            }
          }],
          finishReason: 'tool_calls'
        },
        {
          kind: 'final',
          responseId: 'resp-1',
          model: 'model-1'
        }
      ]))
    }
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any
    const hostSink = {
      handle: vi.fn(async () => undefined)
    }
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    await runner.run({
      runInput: input,
      prepared,
      emitter,
      hostRenderSinks: [hostSink],
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(hostSink.handle).toHaveBeenCalledWith(expect.objectContaining({
      type: 'host.tool.detected',
      toolCallId: 'tool-1'
    }))
    expect(hostSink.handle).toHaveBeenCalledWith(expect.objectContaining({
      type: 'host.preview.updated'
    }))
  })
})
