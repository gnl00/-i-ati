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
  buildEmotionSystemPrompt: vi.fn(() => 'emotion prompt'),
  buildEmotionContextContent: vi.fn((summary?: string) => summary ? `<emotion_context>\n${summary}\n</emotion_context>` : ''),
  buildUserInfoSystemPrompt: vi.fn(() => 'user info policy'),
  buildUserInfoContextContent: vi.fn(() => '<user_info_context>{"profile":{"name":null}}</user_info_context>'),
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
import {
  ChatPreparationPipeline,
  RunEnvironmentService,
  StepBootstrapService,
  type RunEnvironment
} from '..'
import type { ChatInitialTranscriptSeed } from '@main/agent/contracts'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

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

function findUserSeedIndexByContent(messages: ChatInitialTranscriptSeed[], marker: string): number {
  return messages.findIndex(message => (
    message.kind === 'user'
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
    expect(chatContext.earlyEmittedMessageIds).toEqual([101])
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
    expect(runSpec.initialTranscriptSeed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'user',
        source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT,
        content: expect.stringContaining('<system-environment>')
      }),
      expect.objectContaining({
        kind: 'user',
        source: MESSAGE_SOURCE.USER_INFO_CONTEXT,
        content: expect.stringContaining('<user_info_context>')
      }),
      expect.objectContaining({
        kind: 'user',
        source: MESSAGE_SOURCE.AWAKE_CONTEXT,
        content: expect.stringContaining('<awake_state>')
      }),
      expect.objectContaining({
        kind: 'user',
        content: 'hello'
      })
    ]))
    expect(runSpec.initialTranscriptSeed.filter(message => (
      message.kind === 'user'
      && message.content === 'hello'
    ))).toHaveLength(1)
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
    expect(runSpec.requestSpec).toEqual(expect.objectContaining({
      adapterPluginId: 'openai-chat-compatible-adapter',
      model: 'model-1',
      modelType: 'llm',
      stream: true,
      baseUrl: 'https://example.com/v1'
    }))
    expect(runSpec.requestSpec.systemPrompt).toContain('system prompt')
    expect(runSpec.initialTranscriptSeed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'user',
        content: 'hello'
      })
    ]))
  })

  it('adds hidden vision observation after visible image user message', async () => {
    const visionObservation = {
      id: 202,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content: '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>',
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
      emit: vi.fn()
    } as any

    const prepared = await service.prepare({
      ...input,
      input: {
        ...input.input,
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc']
      }
    }, emitter)

    expect(visionObservationService.observe).toHaveBeenCalledWith(expect.objectContaining({
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
    }))
    expect(prepared.chatContext.createdMessages).toHaveLength(2)
    expect(prepared.chatContext.earlyEmittedMessageIds).toEqual([101])
    expect(prepared.chatContext.messageEntities[prepared.chatContext.messageEntities.length - 2]?.body.content).toEqual([
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
    expect(prepared.chatContext.messageEntities[prepared.chatContext.messageEntities.length - 1]).toBe(visionObservation)
    expect(prepared.runSpec.requestSpec.model).toBe('model-1')
    expect(prepared.runSpec.initialTranscriptSeed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content: expect.stringContaining('Summary: chart')
      })
    ]))
  })

  it('emits the visible image user message before vision observation resolves', async () => {
    const visionObservation = {
      id: 202,
      chatId: 1,
      chatUuid: 'chat-1',
      body: {
        role: 'user',
        source: MESSAGE_SOURCE.VISION_OBSERVATION,
        content: '<vision_observation image_ref="message:101" status="ok">Summary: chart</vision_observation>',
        segments: []
      }
    } as MessageEntity
    let resolveVisionObservation: (message: MessageEntity) => void = () => {}
    const visionObservationService = {
      observe: vi.fn(() => new Promise<MessageEntity>((resolve) => {
        resolveVisionObservation = resolve
      }))
    }
    const service = new ChatPreparationPipeline(
      new RunEnvironmentService(),
      new StepBootstrapService(undefined, visionObservationService as any)
    )
    const emitter = {
      emit: vi.fn()
    } as any

    const preparePromise = service.prepare({
      ...input,
      input: {
        ...input.input,
        textCtx: 'describe this',
        mediaCtx: ['data:image/png;base64,abc']
      }
    }, emitter)

    await Promise.resolve()
    await Promise.resolve()

    expect(visionObservationService.observe).toHaveBeenCalled()
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

    expect(prepared.chatContext.createdMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 101
      }),
      visionObservation
    ]))
    expect(prepared.chatContext.earlyEmittedMessageIds).toEqual([101])
  })

  it('injects system environment and awake_state as ephemeral context before the current user input', async () => {
    const service = new ChatPreparationPipeline()
    const emitter = {
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)
    const messages = prepared.runSpec.initialTranscriptSeed
    const environmentIndex = messages.findIndex(message => (
      message.kind === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<system-environment>')
    ))
    const awakeIndex = messages.findIndex(message => (
      message.kind === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<awake_state>')
    ))
    const currentUserIndex = messages.findIndex(message => (
      message.kind === 'user'
      && message.content === 'hello'
    ))
    const emotionIndex = messages.findIndex(message => (
      message.kind === 'user'
      && typeof message.content === 'string'
      && message.content.startsWith('<emotion_context>')
    ))

    expect(environmentIndex).toBeGreaterThan(-1)
    expect(awakeIndex).toBeGreaterThan(-1)
    expect(emotionIndex).toBe(-1)
    expect(awakeIndex).toBeGreaterThan(environmentIndex)
    expect(currentUserIndex).toBeGreaterThan(awakeIndex)
    expect(messages[environmentIndex].content).toContain('"workspacePath": "./workspaces/chat-1"')
    expect(messages[environmentIndex].content).toContain('"currentTime"')
    expect(messages[awakeIndex].content).toContain('"version": 1')
    expect(messages[awakeIndex].content).toContain('"chat_title": "NewChat"')
    expect(messages[awakeIndex].content).toContain('"summary"')
    expect(messages[environmentIndex]).toEqual(expect.objectContaining({
      source: MESSAGE_SOURCE.SYSTEM_ENVIRONMENT_CONTEXT
    }))
    expect(messages[awakeIndex]).toEqual(expect.objectContaining({
      source: MESSAGE_SOURCE.AWAKE_CONTEXT
    }))
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
    const summaryMessage = prepared.runSpec.initialTranscriptSeed.find(message => (
      message.kind === 'user'
      && typeof message.content === 'string'
      && message.content.includes('compressed history')
    ))

    expect(summaryMessage?.content).toContain('compressed history')
    expect(prepared.runSpec.initialTranscriptSeed.some(message => (
      message.kind === 'assistant'
      && message.content === 'history'
    ))).toBe(false)
    expect(prepared.runSpec.initialTranscriptSeed.filter(message => (
      message.kind === 'user'
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
          thinking: {
            enabled: true,
            effort: 'high'
          }
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
          thinking: {
            enabled: true,
            effort: 'high'
          }
        }
      }
    }, emitter)

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
      thinking: {
        enabled: true,
        effort: 'medium'
      }
    })
  })

  it('preserves explicit disabled thinking for reasoning models', async () => {
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
          thinking: {
            enabled: false
          }
        }
      }
    }, emitter)

    expect(prepared.runSpec.requestSpec.options).toEqual({
      thinking: {
        enabled: false
      }
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

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('## Schedule Execution Context')
    const userInstructionMessageIndex = prepared.runSpec.initialTranscriptSeed.findIndex(message => (
      message.kind === 'user'
      && typeof message.content === 'string'
      && message.content.includes('<user_instruction>')
      && message.content.includes('Keep the answer concise.')
      && message.content.includes('## Schedule Execution Context')
    ))
    expect(userInstructionMessageIndex).toBeGreaterThan(-1)
    expect(prepared.runSpec.initialTranscriptSeed).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'user',
        content: 'hello'
      })
    ]))
    const currentUserMessageIndex = prepared.runSpec.initialTranscriptSeed.findIndex(message => (
      message.kind === 'user' && message.content === 'hello'
    ))
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
      emit: vi.fn()
    } as any

    const prepared = await service.prepare(input, emitter)

    expect(knowledgebaseSearchMock).toHaveBeenCalledWith('hello', expect.objectContaining({
      topK: 4,
      threshold: 0.42,
      folders: ['/workspace/docs']
    }))
    const messages = prepared.runSpec.initialTranscriptSeed
    const knowledgebaseIndex = findUserSeedIndexByContent(messages, '<knowledgebase_context>')
    const currentUserIndex = messages.findIndex(message => (
      message.kind === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_context>')
    expect(knowledgebaseIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(knowledgebaseIndex)
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
    const messages = prepared.runSpec.initialTranscriptSeed
    const policyIndex = findUserSeedIndexByContent(messages, '<knowledgebase_policy>')
    const currentUserIndex = messages.findIndex(message => (
      message.kind === 'user'
      && message.content === 'hello'
    ))

    expect(prepared.runSpec.requestSpec.systemPrompt).not.toContain('<knowledgebase_policy>')
    expect(policyIndex).toBeGreaterThan(-1)
    expect(currentUserIndex).toBeGreaterThan(policyIndex)
    expect(messages[policyIndex].content).toContain('knowledgebase_search')
    expect(messages[policyIndex].content).not.toContain('<knowledgebase_context>')
  })
})
