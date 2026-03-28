import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS, CHAT_RUN_STATES } from '@shared/chatRun/events'
import { AbortError } from '../../errors'

const {
  assistantStepExecuteMock,
  flushPendingAssistantUpdateMock,
  getLastAssistantMessageMock,
  getLastUsageMock
} = vi.hoisted(() => ({
  assistantStepExecuteMock: vi.fn(async () => ({
    completed: true,
    finishReason: 'completed',
    messages: [],
    artifacts: []
  })),
  flushPendingAssistantUpdateMock: vi.fn(),
  getLastAssistantMessageMock: vi.fn(),
  getLastUsageMock: vi.fn()
}))

import { AgentRun } from '../AgentRun'

const input = {
  submissionId: 'submission-1',
  chatId: 1,
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
      account: { id: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
      providerDefinition: { id: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
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
    messageEntities: [],
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

const assistantMessage = {
  id: 102,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content: 'hello back',
    segments: []
  }
} as MessageEntity

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('AgentRun', () => {
  beforeEach(() => {
    assistantStepExecuteMock.mockReset()
    assistantStepExecuteMock.mockResolvedValue({
      completed: true,
      finishReason: 'completed',
      messages: [],
      artifacts: []
    })
    flushPendingAssistantUpdateMock.mockReset()
    getLastAssistantMessageMock.mockReset()
    getLastAssistantMessageMock.mockReturnValue(assistantMessage)
    getLastUsageMock.mockReset()
    getLastUsageMock.mockReturnValue(undefined)
  })

  it('completes the run and does not wait for post-run jobs', async () => {
    const postRunDeferred = createDeferred<void>()
    const postRunPlan = {
      title: 'skipped',
      compression: 'skipped'
    } as const
    const assistantStepFactory = {
      create: vi.fn(() => ({
        loop: {
          execute: assistantStepExecuteMock
        },
        messageManager: {
          flushPendingAssistantUpdate: flushPendingAssistantUpdateMock,
          getLastAssistantMessage: getLastAssistantMessageMock,
          getLastUsage: getLastUsageMock
        }
      }))
    }
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      agentRunKernel: {
        run: vi.fn(async () => ({
          state: 'completed',
          stepResult: {
            completed: true,
            finishReason: 'completed',
            messages: [],
            artifacts: []
          }
        }))
      },
      assistantStepFactory,
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
        createStepRuntimeContext: vi.fn(() => ({
          messageEntities: prepared.chatContext.messageEntities,
          chatId: prepared.chatContext.chat.id,
          chatUuid: prepared.chatContext.chat.uuid
        })),
        finalizeRun: vi.fn(() => ({
          runResult: {
            assistantMessageId: 102,
            usage: undefined,
            state: 'completed'
          },
          postRunInput: {
            submissionId: input.submissionId,
            chatEntity: {
              ...prepared.chatContext.chat,
              title: 'hello'
            },
            messageBuffer: prepared.chatContext.messageEntities,
            content: input.input.textCtx,
            modelContext: prepared.runSpec.modelContext
          }
        }))
      },
      postRunJobService: {
        getPlan: vi.fn(() => postRunPlan),
        emitPlan: vi.fn(),
        run: vi.fn(() => postRunDeferred.promise)
      }
    } as any
    const runtime = {
      emitter,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    }

    const run = new AgentRun(input, services, runtime as any)
    const result = await run.run()

    expect(result).toEqual({
      assistantMessageId: 102,
      usage: undefined,
      state: 'completed'
    })
    expect(services.agentRunKernel.run).toHaveBeenCalledTimes(1)
    expect(services.chatAgentAdapter.prepareRun).toHaveBeenCalledTimes(1)
    expect(assistantStepFactory.create).toHaveBeenCalledTimes(1)
    expect(services.chatAgentAdapter.finalizeRun).toHaveBeenCalledTimes(1)
    expect(services.postRunJobService.getPlan).toHaveBeenCalledTimes(1)
    expect(services.postRunJobService.emitPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: input.submissionId
      }),
      postRunPlan
    )
    expect(services.postRunJobService.run).toHaveBeenCalledTimes(1)
    expect(services.postRunJobService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: input.submissionId
      }),
      postRunPlan
    )
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_COMPLETED, {
      assistantMessageId: 102,
      usage: undefined
    })

    postRunDeferred.resolve()
    await postRunDeferred.promise
  })

  it('emits aborted events when preparation aborts', async () => {
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      agentRunKernel: {
        run: vi.fn()
      },
      assistantStepFactory: {
        create: vi.fn()
      },
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => {
          throw new AbortError()
        }),
        createStepRuntimeContext: vi.fn(),
        finalizeRun: vi.fn()
      },
      postRunJobService: {
        run: vi.fn()
      }
    } as any
    const runtime = {
      emitter,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    }

    const run = new AgentRun(input, services, runtime as any)

    const result = await run.run()
    expect(result).toEqual({ state: 'aborted' })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_ABORTED, {
      reason: 'cancelled'
    })
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.ABORTED
    })
  })

  it('emits aborted events when kernel returns aborted', async () => {
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      agentRunKernel: {
        run: vi.fn(async () => ({
          state: 'aborted'
        }))
      },
      assistantStepFactory: {
        create: vi.fn(() => ({
          loop: {
            execute: assistantStepExecuteMock
          },
          messageManager: {
            flushPendingAssistantUpdate: flushPendingAssistantUpdateMock,
            getLastAssistantMessage: getLastAssistantMessageMock,
            getLastUsage: getLastUsageMock
          }
        }))
      },
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
        createStepRuntimeContext: vi.fn(() => ({
          messageEntities: prepared.chatContext.messageEntities,
          chatId: prepared.chatContext.chat.id,
          chatUuid: prepared.chatContext.chat.uuid
        })),
        abortRun: vi.fn(async () => undefined),
        finalizeRun: vi.fn()
      },
      postRunJobService: {
        run: vi.fn()
      }
    } as any
    const runtime = {
      emitter,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    }

    const run = new AgentRun(input, services, runtime as any)

    const result = await run.run()
    expect(result).toEqual({ state: 'aborted' })
    expect(services.agentRunKernel.run).toHaveBeenCalledTimes(1)
    expect(services.chatAgentAdapter.finalizeRun).not.toHaveBeenCalled()
    expect(emitter.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_ABORTED, {
      reason: 'cancelled'
    })
  })
})
