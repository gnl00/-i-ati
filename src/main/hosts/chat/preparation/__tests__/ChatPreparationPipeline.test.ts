import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => '---\nname: ""\npreferredAddress: ""\nbasicInfo: ""\npreferences: ""\nupdatedAt: 0\n---\n'),
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  default: {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async () => '---\nname: ""\npreferredAddress: ""\nbasicInfo: ""\npreferences: ""\nupdatedAt: 0\n---\n'),
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
    getEmotionStateByChatId: vi.fn(() => undefined),
    getWorkContextByChatUuid: vi.fn(() => undefined),
    listRecentSmartMessageCandidateSummaries: vi.fn(() => []),
    saveMessage: vi.fn(),
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
  buildEmotionSystemPrompt: vi.fn((summary?: string) => summary ? `emotion prompt\n${summary}` : 'emotion prompt'),
  buildUserInfoPrompt: vi.fn(() => 'user info prompt'),
  buildUserInstructionPrompt: vi.fn((prompt?: string) => prompt ? `<user_instruction>\n${prompt}\n</user_instruction>` : '')
}))

vi.mock('@tools/registry', () => ({
  embeddedToolsRegistry: {
    getAllTools: vi.fn(() => [])
  }
}))

const { knowledgebaseSearchMock } = vi.hoisted(() => ({
  knowledgebaseSearchMock: vi.fn<(...args: any[]) => Promise<any[]>>(async () => [])
}))

const {
  getAllMemoriesMock,
  searchMemoriesMock,
  listActivityEntriesMock,
  searchActivityEntriesMock,
  getActivityDateKeyMock
} = vi.hoisted(() => ({
  getAllMemoriesMock: vi.fn(),
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
    getAllMemories: getAllMemoriesMock,
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
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'
import {
  ChatPreparationPipeline,
  RunEnvironmentService,
  type RunEnvironment
} from '..'

const config = {
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

const historyMessages = [{
  id: 11,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'assistant',
    content: 'history',
    segments: []
  }
}] as MessageEntity[]

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
  return messages.some(message => (
    typeof message.body.content === 'string'
    && message.body.content.includes(marker)
  ))
}

function findUserMessageIndexByContent(messages: ChatMessage[], marker: string): number {
  return messages.findIndex(message => (
    message.role === 'user'
    && typeof message.content === 'string'
    && message.content.includes(marker)
  ))
}

describe('ChatPreparationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    knowledgebaseSearchMock.mockResolvedValue([])
    getAllMemoriesMock.mockResolvedValue([])
    searchMemoriesMock.mockResolvedValue([])
    listActivityEntriesMock.mockResolvedValue([])
    searchActivityEntriesMock.mockResolvedValue([])
    getActivityDateKeyMock.mockReturnValue('2026-05-14')
    ;(DatabaseService.getConfig as any).mockReturnValue(config)
    ;(DatabaseService.getChatById as any).mockReturnValue(chatEntity)
    ;(DatabaseService.getChatByUuid as any).mockReturnValue(undefined)
    ;(DatabaseService.getMessagesByChatId as any).mockReturnValue([])
    ;(DatabaseService.getMessagesByChatUuid as any).mockReturnValue(historyMessages)
    ;(DatabaseService.saveMessage as any).mockReturnValueOnce(101)
    ;(DatabaseService.updateChat as any).mockReset()
    ;(DatabaseService.getPlugins as any).mockReturnValue([{
      pluginId: 'openai-chat-compatible-adapter',
      name: 'OpenAI Chat Compatible Adapter',
      source: 'built-in',
      enabled: true,
      status: 'installed',
      capabilities: [{
        kind: 'request-adapter',
        data: {
          providerType: 'openai',
          modelTypes: ['llm', 'vlm'],
          thinking: {
            levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
            defaultLevel: 'medium'
          }
        }
      }]
    }])
  })

  it('prepares environment without emitting chat-facing events directly', async () => {
    const service = new RunEnvironmentService()
    const emitter = {
      emit: vi.fn()
    } as any

    const environment = await service.prepare(input, emitter)

    expect(environment).toEqual<RunEnvironment>({
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
  })

  it('builds step bootstrap and request through the pipeline', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const { runSpec, chatContext } = prepared

    expect(chatContext.chat).toEqual(chatEntity)
    expect(chatContext.historyMessages).toEqual(historyMessages)
    expect(chatContext.createdMessages).toHaveLength(1)
    expect(chatContext.messageEntities).toHaveLength(2)
    expect(chatContext.messageEntities[0]).toEqual(historyMessages[0])
    expect(chatContext.assistantDraft).toEqual(expect.objectContaining({
      chatId: 1,
      chatUuid: 'chat-1',
      body: expect.objectContaining({
        role: 'assistant',
        content: ''
      })
    }))
    expect(runSpec.runtimeContext).toEqual({
      chatId: 1,
      chatUuid: 'chat-1',
      workspacePath: './workspaces/chat-1'
    })
    expect(runSpec.initialMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT
      }),
      expect.objectContaining({
        role: 'user',
        source: MESSAGE_SOURCE.AWAKE_CONTEXT
      }),
      expect.objectContaining({
        role: 'user',
        content: 'hello'
      })
    ]))
    expect(runSpec.initialMessages.filter(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))).toHaveLength(1)
    expect(emitter.emit).not.toHaveBeenCalled()
    expect(runSpec.requestSpec).toEqual(expect.objectContaining({
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'model-1',
      modelType: 'llm',
      stream: true,
      baseUrl: 'https://example.com/v1'
    }))
    expect(runSpec.requestSpec.systemPrompt).toContain('system prompt')
    expect(runSpec.initialMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: 'hello'
      })
    ]))
  })

  it('injects system environment and awake_state as ephemeral context before the current user input', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const messages = prepared.runSpec.initialMessages
    const environmentIndex = messages.findIndex(message => (
      message.role === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<system-environment>')
    ))
    const awakeIndex = messages.findIndex(message => (
      message.role === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<awake_state>')
    ))
    const currentUserIndex = messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(environmentIndex).toBeGreaterThan(-1)
    expect(awakeIndex).toBeGreaterThan(-1)
    expect(awakeIndex).toBeGreaterThan(environmentIndex)
    expect(currentUserIndex).toBeGreaterThan(awakeIndex)
    expect(messages[environmentIndex].content).toContain('"workspacePath": "./workspaces/chat-1"')
    expect(messages[environmentIndex].content).toContain('"currentTime"')
    expect(messages[awakeIndex].content).toContain('"version": 1')
    expect(messages[awakeIndex].content).toContain('"raw_query": "hello"')
    expect(prepared.runSpec.initialMessages[environmentIndex].source).toBe(MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT)
    expect(prepared.runSpec.initialMessages[awakeIndex].source).toBe(MESSAGE_SOURCE.AWAKE_CONTEXT)
    expect(chatContextContainsMarker(prepared.chatContext.messageEntities, '<system-environment>')).toBe(false)
    expect(chatContextContainsMarker(prepared.chatContext.messageEntities, '<awake_state>')).toBe(false)
  })

  it('uses compressed canonical messages as runtime initial messages', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      compression: {
        enabled: true
      }
    })
    ;(DatabaseService.getActiveCompressedSummariesByChatId as any).mockReturnValue([{
      id: 1,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [11],
      startMessageId: 11,
      endMessageId: 11,
      summary: 'compressed history',
      compressedAt: 1,
      status: 'active'
    }])

    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const summaryMessage = prepared.runSpec.initialMessages.find(message => (
      message.role === 'user'
      && message.source === MESSAGE_SOURCE.COMPRESSION_SUMMARY
    ))

    expect(summaryMessage?.content).toContain('compressed history')
    expect(prepared.runSpec.initialMessages.some(message => (
      message.role === 'assistant'
      && message.content === 'history'
    ))).toBe(false)
    expect(prepared.runSpec.initialMessages.filter(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))).toHaveLength(1)
  })

  it('omits thinking level when the selected model has no reasoning capability', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare({
      ...input,
      input: {
        ...input.input,
        options: {
          thinkingLevel: 'high'
        }
      }
    }, emitter)

    expect(prepared.runSpec.requestSpec.options).toBeUndefined()
  })

  it('keeps thinking level when adapter and selected model both support reasoning', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [{
        ...config.accounts[0],
        models: [{
          ...config.accounts[0].models[0],
          modalities: ['text', 'reason']
        }]
      }]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare({
      ...input,
      input: {
        ...input.input,
        options: {
          thinkingLevel: 'high'
        }
      }
    }, emitter)

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinkingLevel: 'high'
    })
  })

  it('uses default thinking level when a reasoning model host omits request options', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [{
        ...config.accounts[0],
        models: [{
          ...config.accounts[0].models[0],
          modalities: ['text', 'reason']
        }]
      }]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinkingLevel: 'medium'
    })
  })

  it('preserves explicit thinking none for reasoning models', async () => {
    ;(DatabaseService.getConfig as any).mockReturnValue({
      ...config,
      accounts: [{
        ...config.accounts[0],
        models: [{
          ...config.accounts[0].models[0],
          modalities: ['text', 'reason']
        }]
      }]
    })
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare({
      ...input,
      input: {
        ...input.input,
        options: {
          thinkingLevel: 'none'
        }
      }
    }, emitter)

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinkingLevel: 'none'
    })
  })

  it('appends schedule execution context only for schedule-triggered runs', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare({
      ...input,
      input: {
        ...input.input,
        source: 'schedule',
        userInstruction: 'Keep the answer concise.'
      }
    }, emitter)

    expect(prepared.runSpec.requestSpec.userInstruction).toContain('Keep the answer concise.')
    expect(prepared.runSpec.requestSpec.userInstruction).toContain('## Schedule Execution Context')
    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('## Schedule Execution Context')
    expect(prepared.runSpec.initialMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('Keep the answer concise.')
      })
    ]))
    expect(prepared.runSpec.initialMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('## Schedule Execution Context')
      })
    ]))
    expect(prepared.runSpec.initialMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: 'hello'
      })
    ]))
    const currentUserMessage = prepared.runSpec.initialMessages.find(message => (
      message.role === 'user' && message.content === 'hello'
    ))
    expect(currentUserMessage).toEqual(expect.objectContaining({
      source: MESSAGE_SOURCE.SCHEDULE,
      segments: []
    }))
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
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(knowledgebaseSearchMock).toHaveBeenCalledWith('hello', expect.objectContaining({
      topK: 4,
      threshold: 0.42,
      folders: ['/workspace/docs']
    }))
    const messages = prepared.runSpec.initialMessages
    const knowledgebaseIndex = findUserMessageIndexByContent(messages, '<knowledgebase_context>')
    const currentUserIndex = messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_context>')
    expect(knowledgebaseIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(knowledgebaseIndex)
    expect(messages[knowledgebaseIndex]).toEqual(expect.objectContaining({
      source: MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT,
      segments: []
    }))
    expect(messages[knowledgebaseIndex].content).toContain('/workspace/docs/guide.md')
    expect(messages[knowledgebaseIndex].content).toContain('Knowledge base snippet for the current request.')
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
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(knowledgebaseSearchMock).not.toHaveBeenCalled()
    const messages = prepared.runSpec.initialMessages
    const policyIndex = findUserMessageIndexByContent(messages, '<knowledgebase_policy>')
    const currentUserIndex = messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_policy>')
    expect(policyIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(policyIndex)
    expect(messages[policyIndex]).toEqual(expect.objectContaining({
      source: MESSAGE_SOURCE.KNOWLEDGEBASE_CONTEXT,
      segments: []
    }))
    expect(messages[policyIndex].content).toContain('knowledgebase_search')
    expect(messages[policyIndex].content).not.toContain('<knowledgebase_context>')
  })
})
