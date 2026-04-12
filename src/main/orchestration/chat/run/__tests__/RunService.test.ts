import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'

const {
  emitterInstances,
  runtimeRunnerMock,
  updateChatMock,
  updateMessageMock,
  generateTitleMock,
  compressionExecuteMock
} = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn>; setChatMeta: ReturnType<typeof vi.fn> }>,
  runtimeRunnerMock: vi.fn(async () => ({
    runtimeResult: {
      state: 'completed' as const,
      stepResult: {
        completed: true,
        finishReason: 'completed',
        requestHistoryMessages: [],
        artifacts: []
      }
    },
    stepCommitter: {
      getFinalAssistantMessage: vi.fn(() => ({
        id: 102,
        chatId: 1,
        chatUuid: 'chat-1',
        body: {
          role: 'assistant',
          content: '',
          segments: [],
          typewriterCompleted: false
        }
      })),
      getLastUsage: vi.fn(() => undefined)
    }
  })),
  updateChatMock: vi.fn(),
  updateMessageMock: vi.fn(),
  generateTitleMock: vi.fn(async () => 'generated title'),
  compressionExecuteMock: vi.fn(async () => ({ success: true }))
}))

vi.mock('../infrastructure', () => {
  class RunEventEmitter {
    emit = vi.fn()
    setChatMeta = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class RunEventEmitterFactory {
    create() {
      return new RunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return {
    RunEventEmitter,
    RunEventEmitterFactory,
    ToolConfirmationManager: class {
      request = vi.fn(async () => ({ approved: true }))
      resolve = vi.fn()
    }
  }
})

vi.mock('../runtime/DefaultMainAgentRuntimeRunner', () => ({
  DefaultMainAgentRuntimeRunner: class {
    run = runtimeRunnerMock
  }
}))

vi.mock('@main/agent/tools', () => ({
  ToolExecutor: class {
    execute = vi.fn(async () => [])
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
  }
}))

vi.mock('@main/services/userInfo/UserInfoService', () => ({
  default: {
    getUserInfo: vi.fn(async () => ({
      info: {
        name: '',
        preferredAddress: '',
        basicInfo: '',
        preferences: '',
        updatedAt: 0
      },
      isEmpty: true,
      exists: false,
      filePath: '/tmp/user-info.md'
    }))
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getConfig: vi.fn(() => ({
      accounts: [{
        id: 'account-1',
        providerId: 'provider-1',
        apiUrl: 'https://example.com/v1',
        apiKey: 'key',
        models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
      }],
      providerDefinitions: [{
        id: 'provider-1',
        adapterPluginId: 'openai-chat-compatible-adapter',
        requestOverrides: undefined
      }],
      tools: {
        titleGenerateEnabled: false
      },
      compression: {
        enabled: false,
        autoCompress: false,
        triggerThreshold: 10,
        compressCount: 5,
        keepRecentCount: 5
      }
    })),
    getChatById: vi.fn((chatId: number) => ({
      id: chatId,
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
    getMessagesByChatId: vi.fn(() => []),
    getMessagesByChatUuid: vi.fn(() => []),
    saveMessage: vi.fn()
      .mockReturnValueOnce(101)
      .mockReturnValueOnce(102)
      .mockReturnValue(103),
    updateChat: updateChatMock,
    updateMessage: updateMessageMock,
    getEmotionStateByChatId: vi.fn(() => null),
    upsertEmotionState: vi.fn(),
    getActiveCompressedSummariesByChatId: vi.fn(() => []),
    getSkills: vi.fn(() => []),
    getConfigValue: vi.fn(() => undefined)
  }
}))

vi.mock('@main/orchestration/chat/maintenance/MessageCompressionService', () => ({
  compressionService: {
    execute: compressionExecuteMock
  }
}))

vi.mock('@main/orchestration/chat/maintenance/TitleGenerationService', async () => {
  const actual = await vi.importActual<typeof import('@main/orchestration/chat/maintenance/TitleGenerationService')>(
    '@main/orchestration/chat/maintenance/TitleGenerationService'
  )
  return {
    ...actual,
    generateTitle: generateTitleMock
  }
})

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

vi.mock('@shared/prompts', () => ({
  systemPrompt: vi.fn(() => 'system prompt'),
  buildUserInfoPrompt: vi.fn(() => ''),
  buildEmotionSystemPrompt: vi.fn(() => ''),
  buildSkillsSystemPrompt: vi.fn(() => ''),
  buildUserInstructionPrompt: vi.fn(() => '')
}))

vi.mock('@shared/services/skills/SkillPromptBuilder', () => ({
  buildSkillsPrompt: vi.fn(() => '')
}))

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    listSkills: vi.fn(async () => []),
    getSkillContent: vi.fn(async () => '')
  }
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getAllTools: vi.fn(() => [])
  }
}))

import { RunService } from '../index'
import DatabaseService from '@main/db/DatabaseService'

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('RunService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    runtimeRunnerMock.mockReset()
    runtimeRunnerMock.mockResolvedValue({
      runtimeResult: {
        state: 'completed',
        stepResult: {
          completed: true,
          finishReason: 'completed',
          requestHistoryMessages: [],
          artifacts: []
        }
      },
      stepCommitter: {
        getFinalAssistantMessage: vi.fn(() => ({
          id: 102,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'assistant',
            content: '',
            segments: [],
            typewriterCompleted: false
          }
        })),
        getLastUsage: vi.fn(() => undefined)
      }
    })
    updateChatMock.mockReset()
    updateMessageMock.mockReset()
    generateTitleMock.mockReset()
    generateTitleMock.mockResolvedValue('generated title')
    compressionExecuteMock.mockReset()
    compressionExecuteMock.mockResolvedValue({ success: true })
    ;(DatabaseService.getConfig as any).mockReturnValue({
      accounts: [{
        id: 'account-1',
        providerId: 'provider-1',
        apiUrl: 'https://example.com/v1',
        apiKey: 'key',
        models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
      }],
      providerDefinitions: [{
        id: 'provider-1',
        adapterPluginId: 'openai-chat-compatible-adapter',
        requestOverrides: undefined
      }],
      tools: {
        titleGenerateEnabled: false
      },
      compression: {
        enabled: false,
        autoCompress: false,
        triggerThreshold: 10,
        compressCount: 5,
        keepRecentCount: 5
      }
    })
    ;(DatabaseService.saveMessage as any).mockReset()
    ;(DatabaseService.saveMessage as any)
      .mockReturnValueOnce(101)
      .mockReturnValueOnce(102)
      .mockReturnValue(103)
  })

  it('returns accepted immediately from start without waiting for loop completion', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof runtimeRunnerMock>>>()
    runtimeRunnerMock.mockReturnValueOnce(deferred.promise)

    const service = new RunService()
    const result = await service.start({
      submissionId: 'submission-1',
      chatId: 1,
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      input: {
        textCtx: 'hello',
        mediaCtx: [],
        stream: true
      }
    })

    expect(result).toEqual({
      accepted: true,
      submissionId: 'submission-1'
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(runtimeRunnerMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId: 'submission-1'
    })

    deferred.resolve({
      runtimeResult: {
        state: 'completed',
        stepResult: {
          completed: true,
          finishReason: 'completed',
          requestHistoryMessages: [],
          artifacts: []
        }
      },
      stepCommitter: {
        getFinalAssistantMessage: vi.fn(() => ({
          id: 102,
          chatId: 1,
          chatUuid: 'chat-1',
          body: {
            role: 'assistant',
            content: '',
            segments: [],
            typewriterCompleted: false
          }
        })),
        getLastUsage: vi.fn(() => undefined)
      }
    })
    await deferred.promise
  })

  it('does not wait for post-run title or compression jobs before resolving execute', async () => {
    const titleDeferred = createDeferred<string>()
    const compressionDeferred = createDeferred<any>()
    generateTitleMock.mockReturnValueOnce(titleDeferred.promise)
    compressionExecuteMock.mockReturnValueOnce(compressionDeferred.promise)
    ;(DatabaseService.getConfig as any).mockReturnValue({
      accounts: [{
        id: 'account-1',
        providerId: 'provider-1',
        apiUrl: 'https://example.com/v1',
        apiKey: 'key',
        models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
      }],
      providerDefinitions: [{
        id: 'provider-1',
        adapterPluginId: 'openai-chat-compatible-adapter',
        requestOverrides: undefined
      }],
      tools: {
        titleGenerateEnabled: true
      },
      compression: {
        enabled: true,
        autoCompress: true,
        triggerThreshold: 1,
        compressCount: 1,
        keepRecentCount: 0
      }
    })

    const service = new RunService()
    const result = await service.execute({
      submissionId: 'submission-2',
      chatId: 1,
      modelRef: { accountId: 'account-1', modelId: 'model-1' },
      input: {
        textCtx: 'generate title later',
        mediaCtx: [],
        stream: true
      }
    })

    expect(result).toEqual({
      userMessageId: 101,
      assistantMessageId: 102,
      usage: undefined,
      state: 'completed'
    })
    await Promise.resolve()
    expect(generateTitleMock).toHaveBeenCalledTimes(1)
    expect(compressionExecuteMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances.some(instance =>
      instance.emit.mock.calls.some(call => call[0] === RUN_EVENTS.RUN_COMPLETED)
    )).toBe(true)

    titleDeferred.resolve('async title')
    compressionDeferred.resolve({ success: true })
    await Promise.all([titleDeferred.promise, compressionDeferred.promise])
  })
})
