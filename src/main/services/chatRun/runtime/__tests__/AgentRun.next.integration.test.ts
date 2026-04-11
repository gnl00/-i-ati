import { describe, expect, it, vi } from 'vitest'
import type { ModelResponseChunk } from '@main/services/next/runtime/model/ModelResponseChunk'
import type { ModelStreamExecutor } from '@main/services/next/runtime/model/ModelStreamExecutor'
import { DefaultMainAgentNextRuntimeRunner } from '../next/MainAgentNextRuntimeRunner'
import { AgentRun } from '../AgentRun'

vi.mock('@main/services/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    saveMessage: vi.fn(() => 401),
    updateChat: vi.fn(),
    saveChatRunEvent: vi.fn()
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
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
    historyMessages: [],
    createdMessages: [],
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

describe('AgentRun next integration', () => {
  it('runs through next runner and finalizeRun end-to-end', async () => {
    const modelStreamExecutor: ModelStreamExecutor = {
      execute: vi.fn(async () => createAsyncStream([
        {
          kind: 'delta',
          responseId: 'resp-1',
          model: 'model-1',
          content: 'hello from next runtime',
          finishReason: 'stop',
          usage: {
            promptTokens: 1,
            completionTokens: 2,
            totalTokens: 3
          }
        },
        {
          kind: 'final',
          responseId: 'resp-1',
          model: 'model-1'
        }
      ]))
    }

    const mainAgentNextRuntimeRunner = new DefaultMainAgentNextRuntimeRunner(undefined, undefined, {
      modelStreamExecutor
    })

    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    }

    const finalizeRun = vi.fn(async ({ stepCommitter, stepResult }) => ({
      runResult: {
        assistantMessageId: 102,
        usage: stepResult.usage ?? stepCommitter.getLastUsage(),
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

    const services = {
      agentRunKernel: {
        run: vi.fn()
      },
      assistantStepFactory: {
        create: vi.fn()
      },
      mainAgentNextRuntimeRunner,
      chatAgentAdapter: {
        prepareRun: vi.fn(async () => prepared),
        createStepRuntimeContext: vi.fn(),
        abortRun: vi.fn(),
        finalizeRun
      },
      postRunJobService: {
        getPlan: vi.fn(() => null),
        emitPlan: vi.fn(),
        run: vi.fn()
      }
    } as any

    const run = new AgentRun(input, services, {
      emitter: emitter as any,
      toolConfirmationRequester: {
        request: vi.fn(async () => ({ approved: true }))
      }
    })

    const result = await run.run()

    expect(result).toEqual({
      assistantMessageId: 102,
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3
      },
      state: 'completed'
    })
    expect(finalizeRun).toHaveBeenCalledTimes(1)
    expect(finalizeRun.mock.calls[0]?.[0]?.stepCommitter.getFinalAssistantMessage()).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          content: 'hello from next runtime'
        })
      })
    )
    expect(services.agentRunKernel.run).not.toHaveBeenCalled()
    expect(services.assistantStepFactory.create).not.toHaveBeenCalled()
  })
})
