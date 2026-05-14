import { beforeEach, describe, expect, it, vi } from 'vitest'

const { databaseMock, loggerMock, unifiedChatRequestMock } = vi.hoisted(() => ({
  databaseMock: {
    getActiveCompressedSummariesByChatId: vi.fn(),
    updateCompressedSummaryStatus: vi.fn(),
    saveCompressedSummary: vi.fn()
  },
  loggerMock: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  unifiedChatRequestMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: databaseMock
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => loggerMock)
}))

import { MessageCompressionService } from '../MessageCompressionService'

const config: CompressionConfig = {
  enabled: true,
  autoCompress: true,
  triggerTokenRatio: 0.7
}

const model: AccountModel = {
  id: 'model-1',
  label: 'Model 1',
  type: 'llm',
  contextWindowTokens: 1000
}

const account: ProviderAccount = {
  id: 'account-1',
  providerId: 'provider-1',
  label: 'Account 1',
  apiUrl: 'https://example.com/v1',
  apiKey: 'key',
  models: []
}

const providerDefinition: ProviderDefinition = {
  id: 'provider-1',
  displayName: 'Provider 1',
  adapterPluginId: 'openai-chat-compatible-adapter'
}

const message = (
  id: number,
  role: ChatMessage['role'],
  content: string,
  tokens?: number,
  overrides: Partial<ChatMessage> = {}
): MessageEntity => ({
  id,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role,
    content,
    segments: [],
    ...overrides
  },
  tokens
})

describe('MessageCompressionService', () => {
  beforeEach(() => {
    databaseMock.getActiveCompressedSummariesByChatId.mockReset()
    databaseMock.updateCompressedSummaryStatus.mockReset()
    databaseMock.saveCompressedSummary.mockReset()
    loggerMock.debug.mockReset()
    loggerMock.info.mockReset()
    loggerMock.warn.mockReset()
    loggerMock.error.mockReset()
    unifiedChatRequestMock.mockReset()
  })

  it('uses accumulated response tokens against model context window', () => {
    const service = new MessageCompressionService()

    expect(service.shouldCompress(699, 1000, config)).toBe(false)
    expect(service.shouldCompress(700, 1000, config)).toBe(true)
  })

  it('keeps the latest three message pairs after the token ratio is reached', () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'new assistant', 700),
      message(5, 'user', 'latest user 1'),
      message(6, 'assistant', 'latest assistant 1'),
      message(7, 'user', 'latest user 2'),
      message(8, 'assistant', 'latest assistant 2'),
      message(9, 'user', 'latest user 3'),
      message(10, 'assistant', 'latest assistant 3')
    ]
    const summaries: CompressedSummaryEntity[] = [{
      id: 9,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1, 2],
      startMessageId: 1,
      endMessageId: 2,
      summary: 'old summary',
      compressedAt: 100,
      status: 'active'
    }]

    const strategy = service.analyzeCompressionStrategy(messages, summaries, model, config)

    expect(strategy).toEqual({
      shouldCompress: true,
      messagesToCompress: [3, 4],
      messagesToKeep: [5, 6, 7, 8, 9, 10],
      existingSummaries: summaries
    })
  })

  it('keeps tool results with their assistant message pair', () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'new assistant', 700),
      message(5, 'user', 'latest user 1'),
      message(6, 'assistant', 'latest assistant 1', undefined, {
        toolCalls: [{
          id: 'call-1',
          type: 'function',
          function: {
            name: 'plan_get_current_chat',
            arguments: '{}'
          }
        }]
      }),
      message(7, 'tool', '{"success":true}', undefined, {
        toolCallId: 'call-1'
      }),
      message(8, 'user', 'latest user 2'),
      message(9, 'assistant', 'latest assistant 2'),
      message(10, 'user', 'latest user 3'),
      message(11, 'assistant', 'latest assistant 3')
    ]
    const summaries: CompressedSummaryEntity[] = [{
      id: 9,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1, 2],
      startMessageId: 1,
      endMessageId: 2,
      summary: 'old summary',
      compressedAt: 100,
      status: 'active'
    }]

    const strategy = service.analyzeCompressionStrategy(messages, summaries, model, config)

    expect(strategy).toEqual({
      shouldCompress: true,
      messagesToCompress: [3, 4],
      messagesToKeep: [5, 6, 7, 8, 9, 10, 11],
      existingSummaries: summaries
    })
  })

  it('skips compression when only the latest three uncompressed message pairs remain', () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'large assistant', 700)
    ]
    const summaries: CompressedSummaryEntity[] = [{
      id: 9,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1],
      startMessageId: 1,
      endMessageId: 1,
      summary: 'old summary',
      compressedAt: 100,
      status: 'active'
    }]

    const strategy = service.analyzeCompressionStrategy(messages, summaries, model, config)

    expect(strategy).toEqual({
      shouldCompress: false,
      messagesToCompress: [],
      messagesToKeep: [2, 3, 4],
      existingSummaries: summaries
    })
  })

  it('saves a cumulative summary with the response token count used for triggering', async () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'new assistant', 700),
      message(5, 'user', 'latest user 1'),
      message(6, 'assistant', 'latest assistant 1'),
      message(7, 'user', 'latest user 2'),
      message(8, 'assistant', 'latest assistant 2'),
      message(9, 'user', 'latest user 3'),
      message(10, 'assistant', 'latest assistant 3')
    ]
    const summaries: CompressedSummaryEntity[] = [{
      id: 9,
      chatId: 1,
      chatUuid: 'chat-1',
      messageIds: [1, 2],
      startMessageId: 1,
      endMessageId: 2,
      summary: 'old summary',
      compressedAt: 100,
      status: 'active'
    }]

    databaseMock.getActiveCompressedSummariesByChatId.mockReturnValue(summaries)
    databaseMock.saveCompressedSummary.mockReturnValue(42)
    unifiedChatRequestMock.mockResolvedValue({ content: 'new summary' })

    const result = await service.compress({
      chatId: 1,
      chatUuid: 'chat-1',
      messages,
      model,
      account,
      providerDefinition,
      config
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      summaryId: 42,
      messageIds: [1, 2, 3, 4],
      usedTokenCount: 700,
      contextWindowTokens: 1000,
      triggerTokenRatio: 0.7
    }))
    expect(databaseMock.updateCompressedSummaryStatus).toHaveBeenCalledWith(9, 'superseded')
    expect(databaseMock.saveCompressedSummary).toHaveBeenCalledWith(expect.objectContaining({
      messageIds: [1, 2, 3, 4],
      startMessageId: 1,
      endMessageId: 4,
      summary: 'new summary',
      usedTokenCountAtCompression: 700,
      status: 'active'
    }))
  })

  it('logs the token-ratio compression decision', async () => {
    const service = new MessageCompressionService()
    databaseMock.getActiveCompressedSummariesByChatId.mockReturnValue([])

    await service.compress({
      chatId: 1,
      chatUuid: 'chat-1',
      messages: [
        message(1, 'user', 'user'),
        message(2, 'assistant', 'assistant', 699)
      ],
      model,
      account,
      providerDefinition,
      config,
      usage: {
        promptTokens: 600,
        completionTokens: 99,
        totalTokens: 699
      }
    })

    expect(loggerMock.info).toHaveBeenCalledWith('compression.strategy.evaluated', expect.objectContaining({
      chatId: 1,
      chatUuid: 'chat-1',
      modelId: 'model-1',
      usedTokenCount: 699,
      contextWindowTokens: 1000,
      triggerTokenRatio: 0.7,
      thresholdTokenCount: 700,
      tokenUsageRatio: 0.699,
      runPromptTokens: 600,
      runCompletionTokens: 99,
      runTotalTokens: 699,
      decisionBasis: 'historical_uncompressed_message_tokens',
      shouldCompress: false,
      decisionReason: 'below_threshold'
    }))
  })

  it('preserves task-plan tool status in the summary request input', async () => {
    const service = new MessageCompressionService()
    unifiedChatRequestMock.mockResolvedValue({ content: 'summary' })

    await service.generateSummary(
      [
        message(1, 'user', '使用 plan 制定分步计划'),
        message(2, 'assistant', '计划已建好，7 步。要开始执行吗？', undefined, {
          toolCalls: [{
            id: 'call-plan-create',
            type: 'function',
            function: {
              name: 'plan_create',
              arguments: JSON.stringify({
                goal: '完成新品去重代码落地',
                status: 'pending',
                steps: [{
                  id: '1',
                  title: '创建 NewProductRecord.java 实体',
                  status: 'todo'
                }]
              })
            }
          }]
        }),
        message(3, 'tool', JSON.stringify({
          success: true,
          plan: {
            id: 'plan-1',
            status: 'pending',
            steps: [{
              id: '1',
              title: '创建 NewProductRecord.java 实体',
              status: 'todo'
            }]
          }
        }), undefined, {
          toolCallId: 'call-plan-create'
        })
      ],
      model,
      account,
      providerDefinition,
      'previous summary'
    )

    const request = unifiedChatRequestMock.mock.calls[0][0] as IUnifiedRequest
    const prompt = request.messages[0].content

    expect(prompt).toContain('<user id="1">')
    expect(prompt).toContain('<assistant id="2">')
    expect(prompt).toContain('<tool name="plan_create" call_id="call-plan-create">')
    expect(prompt).toContain('<param>')
    expect(prompt).toContain('<result message_id="3">')
    expect(prompt).toContain('"status": "pending"')
    expect(prompt).toContain('"status": "todo"')
    expect(prompt).toContain('</tool>')
    expect(prompt).not.toContain('<tool_result id="3"')
    expect(prompt).toContain('pending、todo、doing、in_progress、pending_review、blocked')
    expect(prompt).toContain('record it as open work in Pending Tasks')
  })
})
