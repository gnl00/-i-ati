import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getConfigMock,
  listRecentSmartMessageCandidateSummariesMock,
  getSmartMessageBySourceHashMock,
  markChatSmartMessagesStaleMock,
  upsertSmartMessageMock,
  unifiedChatRequestMock,
  loggerWarnMock
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  listRecentSmartMessageCandidateSummariesMock: vi.fn(),
  getSmartMessageBySourceHashMock: vi.fn(),
  markChatSmartMessagesStaleMock: vi.fn(),
  upsertSmartMessageMock: vi.fn(),
  unifiedChatRequestMock: vi.fn(),
  loggerWarnMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getConfig: getConfigMock,
    listRecentSmartMessageCandidateSummaries: listRecentSmartMessageCandidateSummariesMock,
    getSmartMessageBySourceHash: getSmartMessageBySourceHashMock,
    markChatSmartMessagesStale: markChatSmartMessagesStaleMock,
    upsertSmartMessage: upsertSmartMessageMock
  }
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: loggerWarnMock,
    error: vi.fn()
  }))
}))

const config = {
  providerDefinitions: [{
    id: 'provider-1',
    displayName: 'Provider 1',
    enabled: true,
    adapterPluginId: 'adapter-1'
  }],
  accounts: [{
    id: 'account-1',
    providerId: 'provider-1',
    name: 'Account 1',
    apiKey: 'key',
    apiUrl: 'https://example.test',
    models: [{
      id: 'model-1',
      label: 'Model 1',
      type: 'chat',
      enabled: true
    }]
  }],
  tools: {
    defaultModel: {
      accountId: 'account-1',
      modelId: 'model-1'
    }
  }
} as unknown as IAppConfig

const makeSummary = (overrides: Partial<{
  id: number
  chat_id: number
  chat_uuid: string
  summary: string
  start_message_id: number
  end_message_id: number
  compressed_at: number
  chat_title: string
  chat_update_time: number
  chat_msg_count: number
}> = {}) => ({
  id: 1,
  chat_id: 10,
  chat_uuid: 'chat-1',
  summary: 'The user was working on smart welcome messages and needs a persisted suggestion pipeline.',
  start_message_id: 1,
  end_message_id: 8,
  compressed_at: 1_700_000_100_000,
  chat_title: 'Smart welcome',
  chat_update_time: 1_700_000_200_000,
  chat_msg_count: 24,
  ...overrides
})

describe('SmartMessageGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConfigMock.mockReturnValue(config)
    getSmartMessageBySourceHashMock.mockReturnValue(undefined)
    loggerWarnMock.mockReset()
    unifiedChatRequestMock.mockResolvedValue({
      content: '',
      toolCalls: [{
        id: 'call-1',
        type: 'function',
        function: {
          name: 'generate_smart_messages',
          arguments: JSON.stringify({
            messages: [{
              title: 'Continue welcome',
              body: 'Continue the persisted Smart message pipeline.',
              actionPrompt: 'Review the Smart message pipeline and suggest the next implementation step.',
              reason: 'Recent summaries mention the welcome page work.',
              priorityScore: 0.8
            }]
          })
        }
      }]
    })
  })

  it('groups recent summaries by chat and sorts by priority', async () => {
    const { SmartMessageGenerationService } = await import('../SmartMessageGenerationService')
    const service = new SmartMessageGenerationService()
    const now = 1_700_000_300_000

    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([
      makeSummary({ id: 1, chat_uuid: 'chat-old', chat_update_time: now - 6 * 24 * 60 * 60 * 1000 }),
      makeSummary({ id: 2, chat_uuid: 'chat-new', chat_update_time: now - 60_000, chat_msg_count: 10 }),
      makeSummary({ id: 3, chat_uuid: 'chat-new', chat_update_time: now - 60_000, chat_msg_count: 10 })
    ])

    const groups = service.buildCandidateGroups({
      now,
      lookbackMs: 14 * 24 * 60 * 60 * 1000,
      candidateLimit: 40,
      generationVersion: 1
    })

    expect(groups).toHaveLength(2)
    expect(groups[0].chatUuid).toBe('chat-new')
    expect(groups[0].summaries.map(summary => summary.id)).toEqual([2, 3])
  })

  it('parses generate_smart_messages tool arguments', async () => {
    const { SmartMessageGenerationService } = await import('../SmartMessageGenerationService')
    const service = new SmartMessageGenerationService()

    expect(service.parseToolDrafts([{
      id: 'call-1',
      type: 'function',
      function: {
        name: 'generate_smart_messages',
        arguments: JSON.stringify({
          messages: [{
            title: 'Plan',
            body: 'Continue this work.',
            actionPrompt: 'Make a plan.',
            priorityScore: 0.7
          }]
        })
      }
    }])).toEqual([{
      title: 'Plan',
      body: 'Continue this work.',
      actionPrompt: 'Make a plan.',
      reason: undefined,
      priorityScore: 0.7
    }])
  })

  it('generates and stores a smart message once per source hash', async () => {
    const { SmartMessageGenerationService } = await import('../SmartMessageGenerationService')
    const service = new SmartMessageGenerationService()
    const now = 1_700_000_300_000

    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([makeSummary()])

    const result = await service.generate({ now, maxMessages: 1 })

    expect(result).toEqual({ generated: 1, skipped: 0 })
    expect(markChatSmartMessagesStaleMock).toHaveBeenCalledWith('chat-1')
    expect(unifiedChatRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestOverrides: {
          tool_choice: {
            type: 'function',
            function: {
              name: 'generate_smart_messages'
            }
          }
        },
        tools: [expect.objectContaining({
          function: expect.objectContaining({ name: 'generate_smart_messages' })
        })]
      }),
      null,
      expect.any(Function),
      expect.any(Function)
    )
    expect(upsertSmartMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      chatUuid: 'chat-1',
      title: 'Continue welcome',
      actionPrompt: 'Review the Smart message pipeline and suggest the next implementation step.',
      status: 'active',
      expiresAt: now + 7 * 24 * 60 * 60 * 1000,
      modelId: 'model-1'
    }))
  })

  it('skips existing source hashes', async () => {
    const { SmartMessageGenerationService } = await import('../SmartMessageGenerationService')
    const service = new SmartMessageGenerationService()

    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([makeSummary()])
    getSmartMessageBySourceHashMock.mockReturnValue({ id: 'existing' })

    const result = await service.generate({ now: 1_700_000_300_000, maxMessages: 1 })

    expect(result).toEqual({ generated: 0, skipped: 1 })
    expect(unifiedChatRequestMock).not.toHaveBeenCalled()
    expect(upsertSmartMessageMock).not.toHaveBeenCalled()
  })

  it('skips when the model does not call generate_smart_messages', async () => {
    const { SmartMessageGenerationService } = await import('../SmartMessageGenerationService')
    const service = new SmartMessageGenerationService()

    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([makeSummary()])
    unifiedChatRequestMock.mockResolvedValue({
      content: 'Here is a suggestion.',
      finishReason: 'stop',
      toolCalls: []
    })

    const result = await service.generate({ now: 1_700_000_300_000, maxMessages: 1 })

    expect(result).toEqual({ generated: 0, skipped: 1 })
    expect(loggerWarnMock).toHaveBeenCalledWith('generate.group_failed', expect.objectContaining({
      chatUuid: 'chat-1',
      error: 'generate_smart_messages tool call missing',
      finishReason: 'stop',
      contentPreview: 'Here is a suggestion.',
      toolCallNames: []
    }))
    expect(upsertSmartMessageMock).not.toHaveBeenCalled()
  })

  it('uses the shared ToolDefinition shape for generate_smart_messages', async () => {
    const { generateSmartMessagesTool } = await import('@shared/tools/smartMessages/definitions')

    expect(generateSmartMessagesTool).toEqual(expect.objectContaining({
      type: 'function',
      function: expect.objectContaining({
        name: 'generate_smart_messages',
        parameters: expect.objectContaining({
          type: 'object',
          required: ['messages']
        })
      })
    }))
    expect(generateSmartMessagesTool.function.parameters.properties.messages.type).toBe('array')
  })
})
