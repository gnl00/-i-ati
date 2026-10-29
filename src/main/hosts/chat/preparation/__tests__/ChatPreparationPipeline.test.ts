import { mapChatContext } from '../../runtime/ChatContextMapper'
import { projectContextRequest } from '@main/agent/runtime/context/ContextRequest'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const preparationLogs = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@main/logging/LogService', () => ({ createLogger: (): object => ({
  info: preparationLogs.info, debug: vi.fn(), warn: vi.fn(), error: vi.fn()
}) }))

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(
    async () =>
      '---\nname: ""\npreferredAddress: ""\nbasicInfo: ""\npreferences: ""\nupdatedAt: 0\n---\n'
  ),
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  default: {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(
      async () =>
        '---\nname: ""\npreferredAddress: ""\nbasicInfo: ""\npreferences: ""\nupdatedAt: 0\n---\n'
    ),
    writeFile: vi.fn(async () => undefined),
    rename: vi.fn(async () => undefined)
  }
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/app')
  }
}))

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'chat-uuid-1')
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getConfig: vi.fn(),
    getChatById: vi.fn(),
    getChatByUuid: vi.fn(),
    getMessagesByChatId: vi.fn(),
    getMessagesByChatUuid: vi.fn(),
    getMessageByIds: vi.fn(() => []),
    getReadyToolResultCompactionsByMessageIds: vi.fn(() => []),
    getEmotionState: vi.fn(() => undefined),
    getWorkContextByChatUuid: vi.fn(() => undefined),
    listRecentSmartMessageCandidateSummaries: vi.fn(() => []),
    saveMessage: vi.fn(),
    updateMessage: vi.fn(),
    saveChat: vi.fn(),
    updateChat: vi.fn(),
    getActiveCompressedSummariesByChatId: vi.fn(() => []),
    getSkills: vi.fn(() => []),
    getConfigValue: vi.fn(() => undefined),
    getPlugins: vi.fn(() => [])
  }
}))

vi.mock('@main/services/skills/SkillService', () => ({
  SkillService: {
    listSkills: vi.fn(async () => []),
    getSkillContent: vi.fn(async () => '')
  }
}))

vi.mock('@shared/services/skills/SkillPromptBuilder', () => ({
  buildSkillsPrompt: vi.fn(() => '')
}))

vi.mock('@shared/prompts', () => ({
  systemPrompt: vi.fn(() => 'system prompt'),
  buildEmotionSystemPrompt: vi.fn(() => 'emotion prompt'),
  buildUserInfoSystemPrompt: vi.fn(() => 'user info policy'),
  buildUserInfoContextContent: vi.fn(
    () => '<user_info_context>{"profile":{"name":null}}</user_info_context>'
  ),
  buildUserInstructionPrompt: vi.fn((prompt?: string) =>
    prompt ? `<user_instruction>\n${prompt}\n</user_instruction>` : ''
  )
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getAllTools: vi.fn(() => []),
    getToolMetadata: vi.fn(() => ({
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'web-document'
      }
    }))
  }
}))

const { knowledgebaseSearchMock } = vi.hoisted(() => ({
  knowledgebaseSearchMock: vi.fn<(...args: any[]) => Promise<any[]>>(async () => [])
}))

const {
  getPinnedMemoriesMock,
  searchMemoriesMock,
  listActivityEntriesMock,
  searchActivityEntriesMock,
  getActivityDateKeyMock
} = vi.hoisted(() => ({
  getPinnedMemoriesMock: vi.fn(),
  searchMemoriesMock: vi.fn(),
  listActivityEntriesMock: vi.fn(),
  searchActivityEntriesMock: vi.fn(),
  getActivityDateKeyMock: vi.fn()
}))

vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({
  knowledgebaseService: {
    search: knowledgebaseSearchMock
  }
}))

vi.mock('@main/services/memory/MemoryService', () => ({
  default: {
    getPinnedMemories: getPinnedMemoriesMock,
    searchMemories: searchMemoriesMock
  }
}))

vi.mock('@main/services/activityJournal/ActivityJournalService', () => ({
  default: {
    listEntries: listActivityEntriesMock,
    searchEntries: searchActivityEntriesMock,
    getDateKey: getActivityDateKeyMock
  }
}))

import DatabaseService from '@main/db/DatabaseService'
import {
  ChatPreparationPipeline,
  RunEnvironmentService,
  StepBootstrapService,
  type RunEnvironment
} from '..'
import type { RunEventEmitter } from '@main/agent/contracts'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

const config = {
  accounts: [
    {
      id: 'account-1',
      providerId: 'provider-1',
      apiUrl: 'https://example.com/v1',
      apiKey: 'key',
      models: [{ id: 'model-1', label: 'model-1', type: 'llm' }]
    }
  ],
  providerDefinitions: [
    {
      id: 'provider-1',
      adapterPluginId: 'openai-chat-compatible-adapter',
      requestOverrides: undefined
    }
  ],
  compression: {
    enabled: false
  }
} as any

const chatEntity = {
  id: 1,
  uuid: 'chat-1',
  title: 'NewChat',
  messages: [11],
  modelRef: {
    accountId: 'account-1',
    modelId: 'model-1'
  },
  workspacePath: './workspaces/chat-1',
  userInstruction: '',
  createTime: 1,
  updateTime: 1
} as ChatEntity

const historyMessages = [
  {
    id: 11,
    chatId: 1,
    chatUuid: 'chat-1',
    body: {
      role: 'assistant',
      content: 'history',
      segments: []
    }
  }
] as MessageEntity[]

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

function chatContextContainsMarker(messages: MessageEntity[], marker: string): boolean {
  return messages.some(
    (message) => typeof message.body.content === 'string' && message.body.content.includes(marker)
  )
}

function findUserSeedIndexByContent(messages: ChatMessage[], marker: string): number {
  return messages.findIndex(
    (message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes(marker)
  )
}

describe('ChatPreparationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    knowledgebaseSearchMock.mockResolvedValue([])
    getPinnedMemoriesMock.mockResolvedValue([])
    searchMemoriesMock.mockResolvedValue([])
    listActivityEntriesMock.mockResolvedValue([])
    searchActivityEntriesMock.mockResolvedValue([])
    getActivityDateKeyMock.mockReturnValue('2026-05-14')
    ;(DatabaseService.getConfig as any).mockReturnValue(config)
    ;(DatabaseService.getChatById as any).mockReturnValue(chatEntity)
    ;(DatabaseService.getChatByUuid as any).mockReturnValue(undefined)
    ;(DatabaseService.getMessagesByChatId as any).mockReturnValue([])
    ;(DatabaseService.getMessagesByChatUuid as any).mockReturnValue(historyMessages)
    ;(DatabaseService.getMessageByIds as any).mockReturnValue([])
    ;(DatabaseService.getReadyToolResultCompactionsByMessageIds as any).mockReturnValue([])
    ;(DatabaseService.saveMessage as any).mockReturnValueOnce(101)
    ;(DatabaseService.updateChat as any).mockReset()
    ;(DatabaseService.getPlugins as any).mockReturnValue([
      {
        pluginId: 'openai-chat-compatible-adapter',
        name: 'OpenAI Chat Compatible Adapter',
        source: 'built-in',
        enabled: true,
        status: 'installed',
        capabilities: [
          {
            kind: 'request-adapter',
            data: {
              providerType: 'openai',
              modelTypes: ['llm', 'vlm'],
              thinking: {
                levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
                defaultLevel: 'medium'
              }
            }
          }
        ]
      }
    ])
  })

  it('overlaps vision and context work while freezing the run configuration', async () => {
    const { LoadedSkillsContextProvider } = await import('../request/LoadedSkillsContextProvider')
    const localConfig = structuredClone(config)
    vi.mocked(DatabaseService.getConfig).mockReturnValue(localConfig)
    let clock = 0
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    let releaseVision!: () => void
    let releaseContext!: () => void
    let visionStarted!: () => void
    let contextStarted!: () => void
    const visionEntered = new Promise<void>(resolve => { visionStarted = resolve })
    const contextEntered = new Promise<void>(resolve => { contextStarted = resolve })
    const visionGate = new Promise<void>(resolve => { releaseVision = resolve })
    const contextGate = new Promise<void>(resolve => { releaseContext = resolve })
    const observe = vi.fn(async (): Promise<MessageEntity> => {
      visionStarted()
      await visionGate
      return { id: 202, body: { role: 'user', content: 'observation', segments: [] } }
    })
    const skills = vi.spyOn(LoadedSkillsContextProvider.prototype, 'build').mockImplementationOnce(async () => {
      contextStarted()
      await contextGate
      return null
    })
    try {
      const pending = new ChatPreparationPipeline(undefined,
        new StepBootstrapService(undefined, { observe } as unknown as ConstructorParameters<typeof StepBootstrapService>[1])
      ).prepare({ ...input, input: { ...input.input, mediaCtx: ['data:image/png;base64,abc'] } },
        { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter)
      await Promise.all([visionEntered, contextEntered])
      localConfig.accounts[0].models[0].id = 'changed-during-preparation'
      localConfig.emotion = { enabled: false }
      clock = 80
      releaseVision()
      await new Promise<void>(resolve => setImmediate(resolve))
      clock = 120
      releaseContext()
      const prepared = await pending
      expect(prepared.runSpec.requestSpec.model).toBe('model-1')
      expect(prepared.chatContext.emotionEnabled).toBe(true)
      expect(preparationLogs.info).toHaveBeenLastCalledWith('preparation.measured', expect.objectContaining({
        status: 'completed', durationsMs: { environment: 0, bootstrap: 80, context: 120, assembly: 0, total: 120 }
      }))
    } finally { skills.mockRestore(); now.mockRestore() }
  })

  it('cancels sibling vision work when required context preparation fails', async () => {
    const { SkillsPromptProvider } = await import('../request/SkillsPromptProvider')
    let visionSignal: AbortSignal | undefined
    const observe = vi.fn(async ({ signal }: { signal: AbortSignal }): Promise<MessageEntity> => {
      visionSignal = signal
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    })
    const skills = vi.spyOn(SkillsPromptProvider.prototype, 'build').mockRejectedValueOnce(new Error('catalog unavailable'))
    try {
      await expect(new ChatPreparationPipeline(undefined,
        new StepBootstrapService(undefined, { observe } as unknown as ConstructorParameters<typeof StepBootstrapService>[1])
      ).prepare({ ...input, input: { ...input.input, mediaCtx: ['data:image/png;base64,abc'] } },
        { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter))
        .rejects.toThrow('catalog unavailable')
      expect(visionSignal?.aborted).toBe(true)
      expect(DatabaseService.updateMessage).not.toHaveBeenCalled()
    } finally { skills.mockRestore() }
  })

  it('stops preparation without late context persistence after cancellation', async () => {
    const { LoadedSkillsContextProvider } = await import('../request/LoadedSkillsContextProvider')
    let finish!: (value: null) => void
    let started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const spy = vi.spyOn(LoadedSkillsContextProvider.prototype, 'build').mockImplementationOnce(() => {
      started()
      return new Promise(resolve => { finish = resolve })
    })
    const controller = new AbortController()
    try {
      const pending = new ChatPreparationPipeline().prepare(input, {
        emit: vi.fn(), setChatMeta: vi.fn()
      } as unknown as RunEventEmitter, { signal: controller.signal })
      await entered
      controller.abort()
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      expect(DatabaseService.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
        body: expect.objectContaining({ role: 'user' })
      }))
      vi.mocked(DatabaseService.updateMessage).mockClear()
      finish(null)
      await Promise.resolve()
      await Promise.resolve()
      expect(DatabaseService.updateMessage).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })

  it('prepares and persists CLI messages with explicit model and request overrides', async () => {
    const modelContext = {
      model: { id: 'external', label: 'external', type: 'llm' as const, contextWindowTokens: 200000 },
      account: { ...config.accounts[0], id: 'cli' },
      providerDefinition: config.providerDefinitions[0]
    }
    const prepared = await new ChatPreparationPipeline().prepare({
      ...input, modelRef: { accountId: 'cli', modelId: 'external' },
      input: { ...input.input, source: 'cli' }
    }, { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter, {
      modelContext,
      systemPrompt: 'explicit CLI prompt',
      options: { thinking: { enabled: true } }
    })
    expect(prepared.runSpec.modelContext).toBe(modelContext)
    expect(prepared.runSpec.requestSpec).toMatchObject({
      model: 'external', contextWindowTokens: 200000, systemPrompt: 'explicit CLI prompt',
      options: { thinking: { enabled: true } }
    })
    expect(DatabaseService.saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ role: 'user', source: 'cli' })
    }))
    expect(DatabaseService.updateMessage).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ requestContextSnapshot: expect.any(String) })
    }))
  })

  it('prepares environment without emitting chat-facing events directly', async () => {
    const service = new RunEnvironmentService()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const environment = await service.prepare(input, emitter)

    expect(environment).toEqual<RunEnvironment>({
      config,
      chat: chatEntity,
      modelContext: {
        model: config.accounts[0].models[0],
        account: config.accounts[0],
        providerDefinition: config.providerDefinitions[0]
      },
      workspacePath: './workspaces/chat-1',
      historyMessages
    })
    expect(emitter.emit).not.toHaveBeenCalled()
    expect(emitter.setChatMeta).toHaveBeenCalledWith({
      chatId: 1,
      chatUuid: 'chat-1'
    })
  })

  it('binds a newly created chat before its first chat and user-message events', async () => {
    vi.mocked(DatabaseService.saveChat).mockReturnValue(1)
    const emitter = { emit: vi.fn(), setChatMeta: vi.fn() }

    await new ChatPreparationPipeline().prepare(
      { ...input, chatId: undefined },
      emitter as unknown as RunEventEmitter
    )

    expect(emitter.setChatMeta).toHaveBeenCalledWith({
      chatId: 1,
      chatUuid: 'chat-uuid-1'
    })
    expect(emitter.setChatMeta.mock.invocationCallOrder[0]).toBeLessThan(
      emitter.emit.mock.invocationCallOrder[0]
    )
    expect(emitter.emit.mock.calls.map(([type]) => type)).toContain(
      CHAT_RENDER_EVENTS.MESSAGE_CREATED
    )
  })

  it.each([true, false])('applies emotion enabled=%s to a new conversation request', async (enabled) => {
    vi.mocked(DatabaseService.getConfig).mockReturnValue({ ...config, emotion: { enabled } } as IAppConfig)
    vi.mocked(DatabaseService.getMessagesByChatId).mockReturnValue([])
    vi.mocked(DatabaseService.getMessagesByChatUuid).mockReturnValue([])
    const prepared = await new ChatPreparationPipeline().prepare({
      ...input,
      input: { ...input.input, tools: [{ name: 'emotion_report', parameters: {} }, { name: 'read', parameters: {} }] }
    }, { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter)
    expect(prepared.chatContext.emotionEnabled).toBe(enabled)
    expect(prepared.runSpec.requestSpec.systemPrompt?.includes('emotion prompt')).toBe(enabled)
    expect((prepared.runSpec.requestSpec.tools as Array<{ name: string }>).some(tool => tool.name === 'emotion_report')).toBe(enabled)
    expect((prepared.runSpec.requestSpec.tools as Array<{ name: string }>).some(tool => tool.name === 'read')).toBe(true)
    const awake = prepared.runSpec.contextMessages.find(message => message.source === MESSAGE_SOURCE.AWAKE_CONTEXT)!
    const snapshot = JSON.parse(String(awake.content).replace('<awake_state>', '').replace('</awake_state>', ''))
    expect('emotion' in snapshot).toBe(enabled)
    expect('mood_notes' in snapshot).toBe(enabled)
  })

  it.each([
    ['no tools config', undefined, false],
    ['no vision model', {}, false],
    ['undefined vision model', { visionModel: undefined }, false],
    ['null vision model', { visionModel: null }, false],
    ['configured vision model', { visionModel: { accountId: 'account-1', modelId: 'vision' } }, true],
    ['stale configured reference', { visionModel: { accountId: 'missing', modelId: 'missing' } }, true]
  ] as const)('applies vision slot presence for %s', async (_label, tools, available) => {
    const visionConfig = {
      ...config,
      accounts: [{
        ...config.accounts[0],
        models: [config.accounts[0].models[0], { id: 'vision', type: 'vlm' }]
      }],
      tools
    } as IAppConfig
    vi.mocked(DatabaseService.getConfig).mockReturnValue(visionConfig)
    const prepared = await new ChatPreparationPipeline().prepare({
      ...input,
      input: { ...input.input, tools: [{ name: 'image_analyze', parameters: {} }] }
    }, { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter)
    expect((prepared.runSpec.requestSpec.tools as Array<{ name: string }>).some(
      tool => tool.name === 'image_analyze'
    )).toBe(available)
  })

  it.each([
    [undefined, true],
    [MESSAGE_SOURCE.TUI, true],
    [MESSAGE_SOURCE.TELEGRAM, false],
    [MESSAGE_SOURCE.SCHEDULE, false],
    ['cli', false]
  ])('applies interactive input availability for source=%s', async (source, available) => {
    const prepared = await new ChatPreparationPipeline().prepare({
      ...input,
      input: { ...input.input, source, tools: [{ name: 'ask_user_question', parameters: {} }] }
    }, { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter)
    expect((prepared.runSpec.requestSpec.tools as Array<{ name: string }>).some(
      tool => tool.name === 'ask_user_question'
    )).toBe(available)
  })

  it('builds step bootstrap and request through the pipeline', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const { runSpec, chatContext } = prepared

    expect(chatContext.chat).toEqual(chatEntity)
    expect(chatContext.historyMessages).toEqual(historyMessages)
    expect(chatContext.createdMessages).toHaveLength(1)
    expect(chatContext.earlyEmittedMessageIds).toEqual([101])
    expect(chatContext.messageEntities).toHaveLength(2)
    expect(chatContext.messageEntities[0]).toEqual(historyMessages[0])
    expect(chatContext.assistantDraft).toEqual(
      expect.objectContaining({
        chatId: 1,
        chatUuid: 'chat-1',
        body: expect.objectContaining({
          role: 'assistant',
          content: ''
        })
      })
    )
    expect(runSpec.runtimeContext).toEqual({
      chatId: 1,
      chatUuid: 'chat-1',
      workspacePath: './workspaces/chat-1'
    })
    expect(runSpec.contextMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
          content: expect.stringContaining('<system-environment>')
        }),
        expect.objectContaining({
          role: 'user',
          source: MESSAGE_SOURCE.USER_INFO_CONTEXT,
          content: expect.stringContaining('<user_info_context>')
        }),
        expect.objectContaining({
          role: 'user',
          source: MESSAGE_SOURCE.AWAKE_CONTEXT,
          content: expect.stringContaining('<awake_state>')
        }),
        expect.objectContaining({
          role: 'user',
          content: 'hello'
        })
      ])
    )
    expect(
      runSpec.contextMessages.filter(
        (message) => message.role === 'user' && message.content === 'hello'
      )
    ).toHaveLength(1)
    expect(emitter.emit).toHaveBeenNthCalledWith(1, CHAT_HOST_EVENTS.CHAT_READY, {
      chatEntity,
      workspacePath: './workspaces/chat-1'
    })
    expect(emitter.emit).toHaveBeenNthCalledWith(2, CHAT_HOST_EVENTS.MESSAGES_LOADED, {
      messages: historyMessages
    })
    expect(emitter.emit).toHaveBeenNthCalledWith(3, CHAT_RENDER_EVENTS.MESSAGE_CREATED, {
      message: expect.objectContaining({
        id: 101,
        body: expect.objectContaining({
          role: 'user',
          content: 'hello'
        })
      })
    })
    expect(runSpec.requestSpec).toEqual(
      expect.objectContaining({
        adapterPluginId: 'openai-chat-compatible-adapter',
        model: 'model-1',
        modelType: 'llm',
        stream: true,
        baseUrl: 'https://example.com/v1'
      })
    )
    expect(runSpec.requestSpec.systemPrompt).toContain('system prompt')
    expect(runSpec.contextMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'hello'
        })
      ])
    )
  })

  it('uses raw persisted tool content when a ready compaction hash belongs to older content', async () => {
    const rawToolMessage = {
      id: 21,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'call-fetch',
        content: 'rewritten imported raw result',
        segments: []
      }
    } as MessageEntity
    const toolHistory = [
      {
        id: 20,
        chatId: 1,
        chatUuid: 'chat-1',
        body: {
          role: 'assistant',
          content: '',
          segments: [],
          toolCalls: [
            {
              id: 'call-fetch',
              index: 0,
              type: 'function',
              function: { name: 'web_fetch', arguments: '{}' }
            }
          ]
        }
      },
      rawToolMessage
    ] as MessageEntity[]
    ;(DatabaseService.getMessagesByChatUuid as any).mockReturnValue(toolHistory)
    ;(DatabaseService.getMessageByIds as any).mockReturnValue([rawToolMessage])
    ;(DatabaseService.getReadyToolResultCompactionsByMessageIds as any).mockReturnValue([
      {
        messageId: 21,
        toolName: 'web_fetch',
        toolCallId: 'call-fetch',
        content: 'stale compact result',
        originalHash: createHash('sha256').update('legacy raw result').digest('hex'),
        level: 'balanced',
        compactorId: 'web-document',
        compactorVersion: 1,
        updatedAt: 10
      }
    ])

    const prepared = await new ChatPreparationPipeline().prepare(input, {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any)
    const toolSeed = prepared.runSpec.contextMessages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'call-fetch'
    )

    expect(toolSeed?.content).toBe('rewritten imported raw result')
  })

  it('restores stable model content without selecting a legacy semantic cache', async () => {
    const rawContent = JSON.stringify({
      content: 'current raw result '.repeat(100)
    })
    const rawToolMessage = {
      id: 21,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'call-fetch',
        content: rawContent,
        toolResultModelContent: 'stable model content',
        segments: []
      }
    } as MessageEntity
    const toolHistory = [
      {
        id: 20,
        chatId: 1,
        chatUuid: 'chat-1',
        body: {
          role: 'assistant',
          content: '',
          segments: [],
          toolCalls: [
            {
              id: 'call-fetch',
              index: 0,
              type: 'function',
              function: { name: 'web_fetch', arguments: '{}' }
            }
          ]
        }
      },
      rawToolMessage
    ] as MessageEntity[]
    ;(DatabaseService.getMessagesByChatUuid as any).mockReturnValue(toolHistory)
    ;(DatabaseService.getMessageByIds as any).mockReturnValue([rawToolMessage])
    ;(DatabaseService.getReadyToolResultCompactionsByMessageIds as any).mockReturnValue([
      {
        messageId: 21,
        toolName: 'web_fetch',
        toolCallId: 'call-fetch',
        content: '{"summary":"current compact result"}',
        originalHash: createHash('sha256').update(rawContent).digest('hex'),
        level: 'balanced',
        compactorId: 'web-document',
        compactorVersion: 1,
        updatedAt: 10
      }
    ])

    const prepared = await new ChatPreparationPipeline().prepare(input, {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any)
    const toolSeed = prepared.runSpec.contextMessages.find(
      (message) => message.role === 'tool' && message.toolCallId === 'call-fetch'
    )

    expect(toolSeed).toMatchObject({
      content: rawContent,
      toolResultModelContent: 'stable model content'
    })
    expect(DatabaseService.getReadyToolResultCompactionsByMessageIds).not.toHaveBeenCalled()
  })

  it('resolves repeated tool-call IDs by persisted message identity', async () => {
    const firstRawContent = 'first raw result '.repeat(100)
    const secondRawContent = 'second raw result '.repeat(100)
    const firstToolMessage = {
      id: 21,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'repeated-call',
        content: firstRawContent,
        toolResultModelContent: 'first preview',
        segments: []
      }
    } as MessageEntity
    const secondToolMessage = {
      id: 23,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'tool',
        name: 'web_fetch',
        toolCallId: 'repeated-call',
        content: secondRawContent,
        toolResultModelContent: 'second preview',
        segments: []
      }
    } as MessageEntity
    const assistantToolCall = (id: number): MessageEntity => ({
      id,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'assistant',
        content: '',
        segments: [],
        toolCalls: [
          {
            id: 'repeated-call',
            index: 0,
            type: 'function',
            function: { name: 'web_fetch', arguments: '{}' }
          }
        ]
      }
    })
    const toolHistory = [
      assistantToolCall(20),
      firstToolMessage,
      assistantToolCall(22),
      secondToolMessage
    ]
    ;(DatabaseService.getMessagesByChatUuid as any).mockReturnValue(toolHistory)
    ;(DatabaseService.getMessageByIds as any).mockReturnValue([firstToolMessage, secondToolMessage])
    ;(DatabaseService.getReadyToolResultCompactionsByMessageIds as any).mockReturnValue([
      {
        messageId: 21,
        toolName: 'web_fetch',
        toolCallId: 'repeated-call',
        content: 'first compact result',
        originalHash: createHash('sha256').update(firstRawContent).digest('hex'),
        level: 'balanced',
        compactorId: 'web-document',
        compactorVersion: 1,
        updatedAt: 10
      },
      {
        messageId: 23,
        toolName: 'web_fetch',
        toolCallId: 'repeated-call',
        content: 'second compact result',
        originalHash: createHash('sha256').update(secondRawContent).digest('hex'),
        level: 'balanced',
        compactorId: 'web-document',
        compactorVersion: 1,
        updatedAt: 20
      }
    ])

    const prepared = await new ChatPreparationPipeline().prepare(input, {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any)
    const repeatedToolSeeds = prepared.runSpec.contextMessages.filter(
      (message) => message.role === 'tool' && message.toolCallId === 'repeated-call'
    )

    expect(
      repeatedToolSeeds.map((message) =>
        message.role === 'tool' ? message.toolResultModelContent : undefined
      )
    ).toEqual(['first preview', 'second preview'])
  })

  it('keeps attachment text in persisted history, model context and vision requests', async () => {
    const textAttachments = [{ id: 'paste-1', filename: 'pasted-text-1.txt', text: '  log\r\n你好\n' }]
    const observe = vi.fn(async (): Promise<MessageEntity> => ({
      id: 202, chatId: 1, chatUuid: 'chat-1',
      body: { role: 'user', source: MESSAGE_SOURCE.VISION_OBSERVATION, content: 'observation', segments: [] }
    }))
    const service = new ChatPreparationPipeline(
      new RunEnvironmentService(),
      new StepBootstrapService(undefined, { observe } as unknown as ConstructorParameters<typeof StepBootstrapService>[1])
    )
    const emitter = { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as Parameters<ChatPreparationPipeline['prepare']>[1]
    const prepared = await service.prepare({
      ...input, input: { ...input.input, textCtx: '', mediaCtx: ['data:image/png;base64,abc'], textAttachments }
    }, emitter)
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ textCtx: expect.stringContaining(textAttachments[0].text) }))
    const currentUser = prepared.runSpec.contextMessages.find(message => message.textAttachments?.length)
    expect(currentUser?.composerText).toBe('')
    expect(currentUser?.textAttachments).toEqual(textAttachments)
    expect(JSON.stringify(currentUser?.content)).toContain('Attached text file: pasted-text-1.txt')
    expect(currentUser && Array.isArray(currentUser.content) && currentUser.content.find(part => part.type === 'text')?.text).toContain(textAttachments[0].text)
  })

  it('adds hidden vision observation after visible image user message', async () => {
    const visionObservation = {
      id: 202,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content:
          '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>',
        segments: []
      }
    } as MessageEntity
    const visionObservationService = {
      observe: vi.fn(async () => visionObservation)
    }
    const service = new ChatPreparationPipeline(
      new RunEnvironmentService(),
      new StepBootstrapService(undefined, visionObservationService as any)
    )
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          textCtx: 'describe this',
          mediaCtx: ['data:image/png;base64,abc']
        }
      },
      emitter
    )

    expect(visionObservationService.observe).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: chatEntity,
        userMessage: expect.objectContaining({
          id: 101,
          body: expect.objectContaining({
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,abc',
                  detail: 'auto'
                }
              },
              {
                type: 'text',
                text: 'describe this'
              }
            ]
          })
        }),
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc']
      })
    )
    expect(prepared.chatContext.createdMessages).toHaveLength(2)
    expect(prepared.chatContext.earlyEmittedMessageIds).toEqual([101])
    expect(
      prepared.chatContext.messageEntities[prepared.chatContext.messageEntities.length - 2]?.body
        .content
    ).toEqual([
      {
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,abc',
          detail: 'auto'
        }
      },
      {
        type: 'text',
        text: 'describe this'
      }
    ])
    expect(
      prepared.chatContext.messageEntities[prepared.chatContext.messageEntities.length - 1]
    ).toBe(visionObservation)
    expect(visionObservation.body.requestContextSnapshot).toContain('<request_context>')
    expect(DatabaseService.updateMessage).toHaveBeenCalledWith(visionObservation)
    expect(prepared.runSpec.requestSpec.model).toBe('model-1')
    expect(prepared.runSpec.contextMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          source: MESSAGE_SOURCE.VISION_OBSERVATION,
          content: expect.stringContaining('Summary: chart')
        })
      ])
    )
  })

  it('emits the visible image user message before vision observation resolves', async () => {
    const visionObservation = {
      id: 202,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content:
          '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>',
        segments: []
      }
    } as MessageEntity
    let resolveVisionObservation: (message: MessageEntity) => void = () => {}
    const visionObservationService = {
      observe: vi.fn(
        () =>
          new Promise<MessageEntity>((resolve) => {
            resolveVisionObservation = resolve
          })
      )
    }
    const service = new ChatPreparationPipeline(
      new RunEnvironmentService(),
      new StepBootstrapService(undefined, visionObservationService as any)
    )
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const preparePromise = service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          textCtx: 'describe this',
          mediaCtx: ['data:image/png;base64,abc']
        }
      },
      emitter
    )

    await vi.waitFor(() => expect(visionObservationService.observe).toHaveBeenCalled())
    expect(emitter.emit).toHaveBeenNthCalledWith(1, CHAT_HOST_EVENTS.CHAT_READY, {
      chatEntity,
      workspacePath: './workspaces/chat-1'
    })
    expect(emitter.emit).toHaveBeenNthCalledWith(2, CHAT_HOST_EVENTS.MESSAGES_LOADED, {
      messages: historyMessages
    })
    expect(emitter.emit).toHaveBeenNthCalledWith(3, CHAT_RENDER_EVENTS.MESSAGE_CREATED, {
      message: expect.objectContaining({
        id: 101,
        body: expect.objectContaining({
          role: 'user'
        })
      })
    })

    resolveVisionObservation(visionObservation)
    const prepared = await preparePromise

    expect(prepared.chatContext.createdMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 101
        }),
        visionObservation
      ])
    )
    expect(prepared.chatContext.earlyEmittedMessageIds).toEqual([101])
  })

  it('injects system environment and awake_state as ephemeral context before the current user input', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const messages = prepared.runSpec.contextMessages
    const environmentIndex = messages.findIndex(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.startsWith('<system-environment>')
    )
    const awakeIndex = messages.findIndex(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.startsWith('<awake_state>')
    )
    const currentUserIndex = messages.findIndex(
      (message) => message.role === 'user' && message.content === 'hello'
    )
    const emotionIndex = messages.findIndex(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.startsWith('<emotion_context>')
    )

    expect(environmentIndex).toBeGreaterThan(-1)
    expect(awakeIndex).toBeGreaterThan(-1)
    expect(emotionIndex).toBe(-1)
    expect(awakeIndex).toBeGreaterThan(environmentIndex)
    expect(currentUserIndex).toBeGreaterThan(awakeIndex)
    expect(messages[environmentIndex].content).toContain('"workspacePath": "./workspaces/chat-1"')
    expect(messages[environmentIndex].content).toContain('"currentTime"')
    const awakeSnapshot = JSON.parse(String(messages[awakeIndex].content).replace('<awake_state>', '').replace('</awake_state>', ''))
    expect(awakeSnapshot.version).toBe(2)
    expect(awakeSnapshot.chat_meta.chat_title).toBe('NewChat')
    expect(awakeSnapshot).not.toHaveProperty('session_meta')
    expect(messages[awakeIndex].content).not.toContain('\n  "')
    expect(messages[awakeIndex].content).toContain('"summary"')
    expect(messages[environmentIndex]).toEqual(
      expect.objectContaining({
        source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT
      })
    )
    expect(messages[awakeIndex]).toEqual(
      expect.objectContaining({
        source: MESSAGE_SOURCE.AWAKE_CONTEXT
      })
    )
    expect(
      chatContextContainsMarker(prepared.chatContext.messageEntities, '<system-environment>')
    ).toBe(false)
    expect(chatContextContainsMarker(prepared.chatContext.messageEntities, '<awake_state>')).toBe(
      false
    )
  })

  it('persists the exact emitted context suffix without changing the visible question', async () => {
    const prepared = await new ChatPreparationPipeline().prepare(input, { submissionId: 'snapshot-test', emit: vi.fn(), setChatMeta: vi.fn() })
    const saved = vi.mocked(DatabaseService.updateMessage).mock.calls
      .map(([message]) => message)
      .find(message => message.body.requestContextSnapshot)
    expect(saved?.body.content).toBe('hello')
    expect(saved?.body.requestContextSnapshot).toContain('<system-environment>')
    expect(saved?.body.requestContextSnapshot).toContain('<awake_state>')
    const records = mapChatContext({
      messages: prepared.runSpec.contextMessages, now: 1,
      loopIdentityProvider: {
        nextStepId: () => 'step', nextTranscriptRecordId: () => 'record', nextToolBatchId: () => 'batch'
      }
    })
    const request = projectContextRequest({ records, requestSpec: prepared.runSpec.requestSpec })
    const current = request.messages.find(message => message.role === 'user' &&
      message.content.some(part => part.type === 'input_text' && part.text === 'hello'))
    expect(current).toMatchObject({ content: [
      { type: 'input_text', text: 'hello' },
      { type: 'input_text', text: saved?.body.requestContextSnapshot }
    ] })
  })

  it('stops preparation when saving the context snapshot fails', async () => {
    vi.mocked(DatabaseService.updateMessage).mockImplementationOnce(() => { throw new Error('disk full') })
    await expect(new ChatPreparationPipeline().prepare(input, {
      submissionId: 'snapshot-failure', emit: vi.fn(), setChatMeta: vi.fn()
    })).rejects.toThrow('disk full')
  })

  it('uses compressed canonical messages as runtime initial messages', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      compression: {
        enabled: true
      }
    })
    ;(DatabaseService.getActiveCompressedSummariesByChatId as any).mockReturnValue([
      {
        id: 1,
        chatId: 1,
        chatUuid: 'chat-1',
        messageIds: [11],
        startMessageId: 11,
        endMessageId: 11,
        summary: 'compressed history',
        compressedAt: 1,
        status: 'active'
      }
    ])

    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const summaryMessage = prepared.runSpec.contextMessages.find(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes('compressed history')
    )

    expect(summaryMessage?.content).toContain('compressed history')
    expect(
      prepared.runSpec.contextMessages.some(
        (message) => message.role === 'assistant' && message.content === 'history'
      )
    ).toBe(false)
    expect(
      prepared.runSpec.contextMessages.filter(
        (message) => message.role === 'user' && message.content === 'hello'
      )
    ).toHaveLength(1)
  })

  it('omits thinking level when the selected model has no reasoning capability', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          options: {
            thinking: {
              enabled: true,
              effort: 'high'
            }
          }
        }
      },
      emitter
    )

    expect(prepared.runSpec.requestSpec.options).toBeUndefined()
  })

  it('keeps thinking level when adapter and selected model both support reasoning', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [
        {
          ...config.accounts[0],
          models: [
            {
              ...config.accounts[0].models[0],
              modalities: ['text', 'reason']
            }
          ]
        }
      ]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          options: {
            thinking: {
              enabled: true,
              effort: 'high'
            }
          }
        }
      },
      emitter
    )

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinking: {
        enabled: true,
        effort: 'high'
      }
    })
  })

  it('uses default thinking level when a reasoning model host omits request options', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [
        {
          ...config.accounts[0],
          models: [
            {
              ...config.accounts[0].models[0],
              modalities: ['text', 'reason']
            }
          ]
        }
      ]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinking: {
        enabled: true,
        effort: 'medium'
      }
    })
  })

  it('preserves explicit disabled thinking for reasoning models', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [
        {
          ...config.accounts[0],
          models: [
            {
              ...config.accounts[0].models[0],
              modalities: ['text', 'reason']
            }
          ]
        }
      ]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          options: {
            thinking: {
              enabled: false
            }
          }
        }
      },
      emitter
    )

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinking: {
        enabled: false
      }
    })
  })

  it.each([
    [undefined, 'Saved instruction'],
    ['Desktop override', 'Desktop override'],
    ['', '']
  ])('combines chat instruction %s with run additions', async (chatUserInstruction, expected) => {
    vi.mocked(DatabaseService.getChatById).mockReturnValue({ ...chatEntity, userInstruction: 'Saved instruction' })
    const prepared = await new ChatPreparationPipeline().prepare({
      ...input, input: { ...input.input, chatUserInstruction, userInstruction: 'Run addition' }
    }, { emit: vi.fn(), setChatMeta: vi.fn() } as unknown as RunEventEmitter)
    const instruction = prepared.runSpec.contextMessages.find(message =>
      typeof message.content === 'string' && message.content.includes('<user_instruction>'))?.content
    expect(instruction).toBe(`<user_instruction>\n${[expected, 'Run addition'].filter(Boolean).join('\n\n')}\n</user_instruction>`)
  })

  it('appends schedule execution context only for schedule-triggered runs', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(
      {
        ...input,
        input: {
          ...input.input,
          source: 'schedule',
          userInstruction: 'Keep the answer concise.'
        }
      },
      emitter
    )

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('## Schedule Execution Context')
    const userInstructionMessageIndex = prepared.runSpec.contextMessages.findIndex(
      (message) =>
        message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes('<user_instruction>') &&
        message.content.includes('Keep the answer concise.') &&
        message.content.includes('## Schedule Execution Context')
    )
    expect(userInstructionMessageIndex).toBeGreaterThan(-1)
    expect(prepared.runSpec.contextMessages[userInstructionMessageIndex]?.content).toContain(
      'Reuse the existing scheduled task. Call schedule with action=create only when the user explicitly asks to create a new or recurring schedule.'
    )
    expect(prepared.runSpec.contextMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: 'hello'
        })
      ])
    )
    const currentUserMessageIndex = prepared.runSpec.contextMessages.findIndex(
      (message) => message.role === 'user' && message.content === 'hello'
    )
    expect(currentUserMessageIndex).toBeGreaterThan(userInstructionMessageIndex)
  })

  it('injects retrieved knowledgebase context as ephemeral user context', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      knowledgebase: {
        enabled: true,
        folders: ['/workspace/docs'],
        maxResults: 4,
        retrievalMode: 'auto'
      }
    })
    knowledgebaseSearchMock.mockResolvedValue([
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        filePath: '/workspace/docs/guide.md',
        fileName: 'guide.md',
        folderPath: '/workspace/docs',
        ext: '.md',
        text: 'Knowledge base snippet for the current request.',
        chunkIndex: 0,
        score: 0.91,
        similarity: 0.88,
        charStart: 0,
        charEnd: 42,
        tokenEstimate: 11
      }
    ])

    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(knowledgebaseSearchMock).toHaveBeenCalledWith(
      'hello',
      expect.objectContaining({
        topK: 4,
        threshold: 0.42,
        folders: ['/workspace/docs']
      })
    )
    const messages = prepared.runSpec.contextMessages
    const knowledgebaseIndex = findUserSeedIndexByContent(messages, '<knowledgebase_context>')
    const currentUserIndex = messages.findIndex(
      (message) => message.role === 'user' && message.content === 'hello'
    )

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_context>')
    expect(knowledgebaseIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(knowledgebaseIndex)
    expect(messages[knowledgebaseIndex].content).toContain('/workspace/docs/guide.md')
    expect(messages[knowledgebaseIndex].content).toContain(
      'Knowledge base snippet for the current request.'
    )
  })

  it('adds tool-first retrieval policy as ephemeral user context', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      knowledgebase: {
        enabled: true,
        folders: ['/workspace/docs'],
        maxResults: 4,
        retrievalMode: 'tool-first'
      }
    })

    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn(),
      setChatMeta: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(knowledgebaseSearchMock).not.toHaveBeenCalled()
    const messages = prepared.runSpec.contextMessages
    const policyIndex = findUserSeedIndexByContent(messages, '<knowledgebase_policy>')
    const currentUserIndex = messages.findIndex(
      (message) => message.role === 'user' && message.content === 'hello'
    )

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_policy>')
    expect(policyIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(policyIndex)
    expect(messages[policyIndex].content).toContain('knowledgebase_search')
    expect(messages[policyIndex].content).not.toContain('<knowledgebase_context>')
  })
})
