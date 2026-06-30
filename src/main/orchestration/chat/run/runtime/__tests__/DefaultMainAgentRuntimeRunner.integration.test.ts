import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelResponseChunk } from '@main/agent/runtime/model/ModelResponseChunk'
import type { ModelStreamExecutor } from '@main/agent/runtime/model/ModelStreamExecutor'
import type { PermissionApprovalMode } from '@tools/approval'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import DatabaseService from '@main/db/DatabaseService'
import { SkillService } from '@main/services/skills/SkillService'
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
    getChatById: vi.fn((id: number) => ({
      id,
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
    })),
    getChatByUuid: vi.fn(() => undefined),
    getSkills: vi.fn(() => []),
    updateMessage: vi.fn(),
    updateChat: vi.fn(),
    saveRunEvent: vi.fn()
  }
}))

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    listSkills: vi.fn(),
    getSkillContent: vi.fn()
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
  }
}))

const executeMock = vi.fn()
const toolExecutorOptionsMock = vi.fn()

vi.mock('@main/agent/tools', () => ({
  ToolExecutor: class {
    private readonly options: any

    constructor(options: unknown) {
      this.options = options
      toolExecutorOptionsMock(options)
    }

    async execute(calls: Array<{ id: string; index?: number; function: string; args: string }>) {
      const overrideResult = await executeMock(calls, this.options)
      if (Array.isArray(overrideResult)) {
        return overrideResult
      }
      const call = calls[0]
      this.options.onProgress?.({
        id: call.id || 'tool-1',
        name: call.function,
        phase: 'started'
      })
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
    requestSpec: {
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.com',
      apiKey: 'key',
      model: 'model-1',
      modelType: 'llm',
      stream: true,
      systemPrompt: 'system prompt'
    },
    initialTranscriptSeed: [],
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
    messageEntities: [],
    assistantDraft: {
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
    toolExecutorOptionsMock.mockReset()
    vi.mocked(DatabaseService.getSkills).mockReturnValue([])
    vi.mocked(SkillService.listSkills).mockResolvedValue([])
    vi.mocked(SkillService.getSkillContent).mockResolvedValue('')
  })

  it('passes submitted permission approval mode into tool execution', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              content: 'Done',
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
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    await runner.run({
      runInput: {
        ...input,
        input: {
          ...input.input,
          permissionApprovalMode: 'auto'
        }
      },
      prepared,
      emitter: {
        emit: vi.fn(),
        setChatMeta: vi.fn()
      } as any,
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(toolExecutorOptionsMock).toHaveBeenCalledWith(expect.objectContaining({
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode: 'auto'
      }
    }))
  })

  it('falls back to prepared chat permission approval mode when submit input omits it', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              content: 'Done',
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
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })
    const localPrepared = {
      ...prepared,
      chatContext: {
        ...prepared.chatContext,
        chat: {
          ...prepared.chatContext.chat,
          permissionApprovalMode: 'auto'
        }
      }
    } as any

    await runner.run({
      runInput: input,
      prepared: localPrepared,
      emitter: {
        emit: vi.fn(),
        setChatMeta: vi.fn()
      } as any,
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(toolExecutorOptionsMock).toHaveBeenCalledWith(expect.objectContaining({
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode: 'auto'
      }
    }))
  })

  it('reads updated runtime permission approval mode for each tool batch', async () => {
    let modelCallCount = 0
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => {
        modelCallCount += 1
        if (modelCallCount === 1) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-1',
              model: 'model-1',
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
        }

        if (modelCallCount === 2) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              toolCalls: [{
                argumentsMode: 'snapshot',
                toolCall: {
                  id: 'tool-2',
                  index: 0,
                  type: 'function',
                  function: {
                    name: 'read',
                    arguments: '{"path":"package.json"}'
                  }
                }
              }],
              finishReason: 'tool_calls'
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
            responseId: 'resp-3',
            model: 'model-1',
            content: 'Done',
            finishReason: 'stop'
          },
          {
            kind: 'final',
            responseId: 'resp-3',
            model: 'model-1'
          }
        ])
      })
    }
    let permissionApprovalMode: PermissionApprovalMode | undefined = 'manual'
    const runtimeContext = {
      getPermissionApprovalMode: vi.fn(() => permissionApprovalMode),
      setPermissionApprovalMode: vi.fn((mode: PermissionApprovalMode | undefined) => {
        permissionApprovalMode = mode
      })
    }
    executeMock.mockImplementationOnce(() => {
      runtimeContext.setPermissionApprovalMode('auto')
    })
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    await runner.run({
      runInput: input,
      prepared,
      runtimeContext,
      emitter: {
        emit: vi.fn(),
        setChatMeta: vi.fn()
      } as any,
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(toolExecutorOptionsMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode: 'manual'
      }
    }))
    expect(toolExecutorOptionsMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      approvalPolicy: {
        mode: 'strict',
        permissionApprovalMode: 'auto'
      }
    }))
  })

  it('forwards ToolExecutor started progress after tool confirmation resolves', async () => {
    const events: string[] = []
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => message.role === 'tool')) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              content: 'Done',
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
            toolCalls: [{
              argumentsMode: 'snapshot',
              toolCall: {
                id: 'tool-1',
                index: 0,
                type: 'function',
                function: {
                  name: 'execute_command',
                  arguments: '{"command":"echo approved"}'
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
    executeMock.mockImplementationOnce(async (
      calls: Array<{ id: string; index?: number; function: string; args: string }>,
      options: any
    ) => {
      const call = calls[0]
      events.push('execute_tool_calls')
      await options.requestConfirmation?.({
        toolCallId: call.id,
        name: call.function,
        args: JSON.parse(call.args)
      })
      options.onProgress?.({
        id: call.id,
        name: call.function,
        phase: 'started'
      })
      return [{
        id: call.id,
        index: call.index ?? 0,
        name: call.function,
        content: { ok: true },
        cost: 1,
        status: 'success' as const
      }]
    })
    const hostSink = {
      handle: vi.fn(async (event: any) => {
        if (event.type === 'host.tool.execution.started') {
          events.push('started')
        }
      })
    }
    const toolConfirmationRequester = {
      request: vi.fn(async () => {
        events.push('confirmation_required')
        return { approved: true }
      })
    }
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    await runner.run({
      runInput: input,
      prepared,
      emitter: {
        emit: vi.fn(),
        setChatMeta: vi.fn()
      } as any,
      hostRenderSinks: [hostSink],
      signal: new AbortController().signal,
      toolConfirmationRequester
    })

    expect(toolConfirmationRequester.request).toHaveBeenCalledTimes(1)
    expect(hostSink.handle).toHaveBeenCalledWith(expect.objectContaining({
      type: 'host.tool.execution.started',
      toolCallId: 'tool-1',
      toolName: 'execute_command'
    }))
    expect(events).toEqual([
      'execute_tool_calls',
      'confirmation_required',
      'started'
    ])
  })

  it('builds executable unified request messages from prepared transcript seed', async () => {
    const localPrepared = {
      ...prepared,
      runSpec: {
        ...prepared.runSpec,
        requestSpec: {
          ...prepared.runSpec.requestSpec,
          tools: [{ type: 'function', function: { name: 'read' } }],
          options: { maxTokens: 42 }
        },
        initialTranscriptSeed: [
          {
            kind: 'user',
            content: '<user_instruction>\nBe precise.\n</user_instruction>'
          },
          {
            kind: 'user',
            content: '<system-environment>{"workspacePath":"./workspaces/chat-1"}</system-environment>'
          },
          {
            kind: 'user',
            content: 'hello'
          }
        ]
      }
    } as any
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => createAsyncStream([
        {
          kind: 'delta',
          responseId: 'resp-1',
          model: 'model-1',
          content: 'Done',
          finishReason: 'stop'
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
    const runner = new DefaultMainAgentRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    await runner.run({
      runInput: input,
      prepared: localPrepared,
      emitter,
      signal: new AbortController().signal,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(1)
    const request = vi.mocked(modelStreamExecutor.execute).mock.calls[0][0].request
    expect(request).toEqual(expect.objectContaining({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.com',
      apiKey: 'key',
      model: 'model-1',
      modelType: 'llm',
      systemPrompt: 'system prompt',
      stream: true,
      options: { maxTokens: 42 }
    }))
    expect(request).not.toHaveProperty('userInstruction')
    expect(request.tools).toEqual([{ type: 'function', function: { name: 'read' } }])

    const contextIndex = request.messages.findIndex(message => (
      message.role === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<system-environment>')
    ))
    const userInstructionIndex = request.messages.findIndex(message => (
      message.role === 'user'
      && typeof message.content === 'string'
      && message.content.includes('<user_instruction>')
      && message.content.includes('Be precise.')
    ))
    const currentUserIndex = request.messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(contextIndex).toBeGreaterThan(-1)
    expect(userInstructionIndex).toBeGreaterThan(-1)
    expect(contextIndex).toBeGreaterThan(userInstructionIndex)
    expect(currentUserIndex).toBeGreaterThan(contextIndex)
    expect(request.messages[contextIndex]).not.toHaveProperty('source')
    expect(request.messages[contextIndex]).not.toHaveProperty('segments')
    expect(request.messages[userInstructionIndex]).not.toHaveProperty('source')
    expect(request.messages[userInstructionIndex]).not.toHaveProperty('segments')
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
        type === CHAT_RENDER_EVENTS.PREVIEW_UPDATED
        && payload?.message?.body?.source === 'stream_preview'
        && payload?.message?.body?.segments?.some?.((segment: MessageSegment) => (
          segment.type === 'text' && segment.content === 'Let me inspect that first.'
        ))
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

  it('injects hidden loaded skills context before continuing after load_skill', async () => {
    vi.mocked(DatabaseService.getSkills).mockReturnValue(['frontend-design'])
    vi.mocked(SkillService.listSkills).mockResolvedValue([{
      name: 'frontend-design',
      path: '/skills/frontend-design/SKILL.md'
    } as any])
    vi.mocked(SkillService.getSkillContent).mockResolvedValue('Use frontend workflow.')

    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async ({ request }) => {
        if (request.messages.some(message => (
          message.role === 'user'
          && typeof message.content === 'string'
          && message.content.includes('<loaded_skills_context>')
        ))) {
          return createAsyncStream([
            {
              kind: 'delta',
              responseId: 'resp-2',
              model: 'model-1',
              content: 'Using the skill now.',
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
            toolCalls: [{
              argumentsMode: 'snapshot',
              toolCall: {
                id: 'skill-tool-1',
                index: 0,
                type: 'function',
                function: {
                  name: 'load_skill',
                  arguments: '{"name":"frontend-design"}'
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
    expect(modelStreamExecutor.execute).toHaveBeenCalledTimes(2)
    const secondRequest = vi.mocked(modelStreamExecutor.execute).mock.calls[1][0].request
    const contextMessage = secondRequest.messages.find(message => (
      message.role === 'user'
      && typeof message.content === 'string'
      && message.content.includes('<loaded_skills_context>')
    ))
    expect(contextMessage?.content).toContain(
      '<skill name="frontend-design" path="/skills/frontend-design/SKILL.md" />'
    )
    expect(contextMessage?.content).toContain(
      'Read the full skill file before applying a loaded skill.'
    )
    expect(contextMessage?.content).not.toContain('Use frontend workflow.')
    const toolMessage = secondRequest.messages.find(message => message.role === 'tool')
    expect(toolMessage?.content).not.toContain('Use frontend workflow.')
  })
})
