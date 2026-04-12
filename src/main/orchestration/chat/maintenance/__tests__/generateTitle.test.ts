import { describe, expect, it, vi } from 'vitest'

const { unifiedChatRequestMock, loggerInfoMock } = vi.hoisted(() => ({
  unifiedChatRequestMock: vi.fn(async () => ({ content: 'Generated title' })),
  loggerInfoMock: vi.fn()
}))

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: unifiedChatRequestMock
}))

vi.mock('@main/orchestration/chat/run/infrastructure', () => ({
  RunEventEmitterFactory: vi.fn()
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: loggerInfoMock,
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

import { generateTitle } from '../TitleGenerationService'

describe('generateTitle', () => {
  it('uses a dedicated short title-generation request', async () => {
    loggerInfoMock.mockReset()

    const title = await generateTitle(
      '早上好啊小家伙，我又给你加了点新东西😄',
      { id: 'model-1' } as AccountModel,
      { apiUrl: 'https://example.com', apiKey: 'key' } as ProviderAccount,
      {
        id: 'provider-1',
        adapterPluginId: 'openai-chat-compatible-adapter'
      } as ProviderDefinition
    )

    expect(title).toBe('Generated title')
    expect(unifiedChatRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      stream: false,
      options: { maxTokens: 32 },
      messages: [
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('不要原样复述用户输入')
        })
      ]
    }), null, expect.any(Function), expect.any(Function))
    expect(loggerInfoMock).toHaveBeenCalledWith('title.request.started', expect.objectContaining({
      modelId: 'model-1',
      providerId: 'provider-1',
      contentLength: 20
    }))
    expect(loggerInfoMock).toHaveBeenCalledWith('title.request.completed', expect.objectContaining({
      rawTitle: 'Generated title',
      trimmedTitle: 'Generated title'
    }))
  })
})
