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

vi.mock('@main/services/knowledgebase/KnowledgebaseService', () => ({
  knowledgebaseService: {
    search: knowledgebaseSearchMock
  }
}))

import DatabaseService from '@main/db/DatabaseService'
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
    expect(runSpec.initialMessages).toEqual(chatContext.messageEntities.map(entity => entity.body))
    expect(emitter.emit).not.toHaveBeenCalled()
    expect(runSpec.request).toEqual(expect.objectContaining({
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'model-1',
      modelType: 'llm',
      stream: true,
      baseUrl: 'https://example.com/v1'
    }))
    expect(runSpec.request.systemPrompt).toContain('system prompt')
    expect(runSpec.request.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: 'hello'
      })
    ]))
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

    expect(prepared.runSpec.request.options).toBeUndefined()
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

    expect(prepared.runSpec.request.options).toEqual({
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

    expect(prepared.runSpec.request.options).toEqual({
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

    expect(prepared.runSpec.request.options).toEqual({
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

    expect(prepared.runSpec.request.userInstruction).toContain('Keep the answer concise.')
    expect(prepared.runSpec.request.userInstruction).toContain('## Schedule Execution Context')
    expect(prepared.runSpec.request.systemPrompt).toContain('## Schedule Execution Context')
    expect(prepared.runSpec.request.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        content: 'hello',
        source: 'schedule'
      })
    ]))
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
    const messages = prepared.runSpec.request.messages
    const knowledgebaseIndex = findUserMessageIndexByContent(messages, '<knowledgebase_context>')
    const currentUserIndex = messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.request.systemPrompt).not.toContain('<knowledgebase_context>')
    expect(knowledgebaseIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(knowledgebaseIndex)
    expect(messages[knowledgebaseIndex].source).toBe('knowledgebase_context')
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
    const messages = prepared.runSpec.request.messages
    const policyIndex = findUserMessageIndexByContent(messages, '<knowledgebase_policy>')
    const currentUserIndex = messages.findIndex(message => (
      message.role === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.request.systemPrompt).not.toContain('<knowledgebase_policy>')
    expect(policyIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(policyIndex)
    expect(messages[policyIndex].source).toBe('knowledgebase_context')
    expect(messages[policyIndex].content).toContain('knowledgebase_search')
    expect(messages[policyIndex].content).not.toContain('<knowledgebase_context>')
  })
})
