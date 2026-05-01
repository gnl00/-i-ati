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
  tokens?: number
): MessageEntity => ({
  id,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role,
    content,
    segments: []
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

  it('selects every uncompressed message after the token ratio is reached', () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'new assistant', 700)
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
      messagesToKeep: [],
      existingSummaries: summaries
    })
  })

  it('saves a cumulative summary with the response token count used for triggering', async () => {
    const service = new MessageCompressionService()
    const messages = [
      message(1, 'user', 'old user'),
      message(2, 'assistant', 'old assistant', 200),
      message(3, 'user', 'new user'),
      message(4, 'assistant', 'new assistant', 700)
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
})
