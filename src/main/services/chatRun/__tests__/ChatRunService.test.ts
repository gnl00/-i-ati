import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'

const {
  emitterInstances,
  orchestratorExecuteMock,
  updateChatMock,
  updateMessageMock,
  generateTitleMock,
  compressionExecuteMock
} = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn>; setChatMeta: ReturnType<typeof vi.fn> }>,
  orchestratorExecuteMock: vi.fn(async () => ({
    completed: true,
    finishReason: 'completed',
    messages: [],
    artifacts: []
  })),
  updateChatMock: vi.fn(),
  updateMessageMock: vi.fn(),
  generateTitleMock: vi.fn(async () => 'generated title'),
  compressionExecuteMock: vi.fn(async () => ({ success: true }))
}))

vi.mock('../infrastructure', () => {
  class ChatRunEventEmitter {
    emit = vi.fn()
    setChatMeta = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class ChatRunEventEmitterFactory {
    create() {
      return new ChatRunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return {
    ChatRunEventEmitter,
    ChatRunEventEmitterFactory,
    ToolConfirmationManager: class {
      request = vi.fn(async () => ({ approved: true }))
      resolve = vi.fn()
    }
  }
})

vi.mock('@main/services/agentCore/execution', () => ({
  AgentStepLoop: class {
    execute = orchestratorExecuteMock
  },
  AgentStepRuntimeFactory: class {
    create() {
      return new (class {
        execute = orchestratorExecuteMock
      })()
    }
  },
  ChunkParser: class {}
}))

vi.mock('@main/services/agentCore/tools', () => ({
  ToolExecutor: class {
    execute = vi.fn(async () => [])
  }
}))

vi.mock('@main/services/DatabaseService', () => ({
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
        adapterType: 'openai',
        apiVersion: 'v1',
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
      model: 'model-1',
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
    getActiveCompressedSummariesByChatId: vi.fn(() => []),
    getChatSkills: vi.fn(() => [])
  }
}))

vi.mock('@main/services/CompressionService', () => ({
  compressionService: {
    execute: compressionExecuteMock
  }
}))

vi.mock('@main/services/TitleService', () => ({
  generateTitle: generateTitleMock
}))

vi.mock('@shared/prompts', () => ({
  systemPrompt: vi.fn(() => 'system prompt')
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

import { ChatRunService } from '../index'
import DatabaseService from '@main/services/DatabaseService'

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('ChatRunService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    orchestratorExecuteMock.mockReset()
    orchestratorExecuteMock.mockResolvedValue({
      completed: true,
      finishReason: 'completed',
      messages: [],
      artifacts: []
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
        adapterType: 'openai',
        apiVersion: 'v1',
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
    const deferred = createDeferred<{
      completed: true
      finishReason: 'completed'
      messages: []
      artifacts: []
    }>()
    orchestratorExecuteMock.mockReturnValueOnce(deferred.promise)

    const service = new ChatRunService()
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
    expect(orchestratorExecuteMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId: 'submission-1'
    })

    deferred.resolve({ completed: true, finishReason: 'completed', messages: [], artifacts: [] })
    await deferred.promise
  })

  it('does not wait for post-run title or compression jobs before resolving runBlocking', async () => {
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
        adapterType: 'openai',
        apiVersion: 'v1',
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

    const service = new ChatRunService()
    const result = await service.runBlocking({
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
      assistantMessageId: 102,
      usage: undefined,
      state: 'completed'
    })
    expect(generateTitleMock).toHaveBeenCalledTimes(1)
    expect(compressionExecuteMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances.some(instance =>
      instance.emit.mock.calls.some(call => call[0] === CHAT_RUN_EVENTS.RUN_COMPLETED)
    )).toBe(true)

    titleDeferred.resolve('async title')
    compressionDeferred.resolve({ success: true })
    await Promise.all([titleDeferred.promise, compressionDeferred.promise])
  })
})
