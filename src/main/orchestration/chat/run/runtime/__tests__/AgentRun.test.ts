import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'
import { RUN_STATES } from '@shared/run/lifecycle-events'
import { AbortError } from '@main/agent/contracts'
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
} as const

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

const stepCommitter = {
  getFinalAssistantMessage: vi.fn(() => assistantMessage),
  getLastUsage: vi.fn(() => undefined)
}

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('AgentRun', () => {
  beforeEach(() => {
    stepCommitter.getFinalAssistantMessage.mockReset()
    stepCommitter.getFinalAssistantMessage.mockReturnValue(assistantMessage)
    stepCommitter.getLastUsage.mockReset()
    stepCommitter.getLastUsage.mockReturnValue(undefined)
  })

  it('completes the run and does not wait for post-run jobs', async () => {
    const postRunDeferred = createDeferred<void>()
    const postRunPlan = {
      title: 'skipped',
      compression: 'skipped'
    } as const
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      mainAgentRuntimeRunner: {
        run: vi.fn(async () => ({
          runtimeResult: {
            state: 'completed',
            stepResult: {
              completed: true,
              finishReason: 'completed',
              messages: [],
              artifacts: []
            }
          },
          stepCommitter
        }))
      },
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
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

    const run = new AgentRun(input as any, services, runtime as any)
    const result = await run.run()

    expect(result).toEqual({
      assistantMessageId: 102,
      usage: undefined,
      state: 'completed'
    })
    expect(services.mainAgentRuntimeRunner.run).toHaveBeenCalledTimes(1)
    expect(services.chatAgentAdapter.prepareRun).toHaveBeenCalledTimes(1)
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
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.RUN_COMPLETED, {
      assistantMessageId: 102,
      usage: undefined
    })

    postRunDeferred.resolve()
    await postRunDeferred.promise
  })

  it('runs through the injected main agent runtime runner', async () => {
    const postRunDeferred = createDeferred<void>()
    const postRunPlan = {
      title: 'skipped',
      compression: 'skipped'
    } as const
    const mainAgentRuntimeRunner = {
      run: vi.fn(async () => ({
        runtimeResult: {
          state: 'completed',
          stepResult: {
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            completed: true,
            finishReason: 'stop',
            requestHistoryMessages: [],
            artifacts: []
          }
        },
        stepCommitter: {
          getFinalAssistantMessage: vi.fn(() => assistantMessage),
          getLastUsage: vi.fn(() => ({ promptTokens: 1, completionTokens: 2, totalTokens: 3 }))
        }
      }))
    }
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      mainAgentRuntimeRunner,
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
        finalizeRun: vi.fn(() => ({
          runResult: {
            assistantMessageId: 102,
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
            state: 'completed'
          },
          postRunInput: {
            submissionId: input.submissionId,
            chatEntity: prepared.chatContext.chat,
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
      hostRenderSinks: [{ handle: vi.fn() }],
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    }

    const run = new AgentRun(input as any, services, runtime as any)
    const result = await run.run()

    expect(mainAgentRuntimeRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      hostRenderSinks: runtime.hostRenderSinks
    }))

    expect(result).toEqual({
      assistantMessageId: 102,
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      state: 'completed'
    })
    expect(mainAgentRuntimeRunner.run).toHaveBeenCalledTimes(1)
    expect(mainAgentRuntimeRunner.run).toHaveBeenCalledWith(expect.objectContaining({
      runInput: input,
      prepared
    }))

    postRunDeferred.resolve()
    await postRunDeferred.promise
  })

  it('emits aborted events when preparation aborts', async () => {
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      mainAgentRuntimeRunner: {
        run: vi.fn()
      },
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => {
          throw new AbortError()
        }),
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

    const run = new AgentRun(input as any, services, runtime as any)

    const result = await run.run()
    expect(result).toEqual({ state: 'aborted' })
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.RUN_ABORTED, {
      reason: 'cancelled'
    })
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.ABORTED
    })
  })

  it('emits aborted events when runner returns aborted', async () => {
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }
    const services = {
      mainAgentRuntimeRunner: {
        run: vi.fn(async () => ({
          runtimeResult: {
            state: 'aborted'
          },
          stepCommitter
        }))
      },
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
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

    const run = new AgentRun(input as any, services, runtime as any)

    const result = await run.run()
    expect(result).toEqual({ state: 'aborted' })
    expect(services.mainAgentRuntimeRunner.run).toHaveBeenCalledTimes(1)
    expect(services.chatAgentAdapter.finalizeRun).not.toHaveBeenCalled()
    expect(emitter.emit).toHaveBeenCalledWith(RUN_EVENTS.RUN_ABORTED, {
      reason: 'cancelled'
    })
  })
})
