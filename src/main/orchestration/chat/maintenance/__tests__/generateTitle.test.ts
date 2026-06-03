import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  beforeEach(() => {
    unifiedChatRequestMock.mockClear()
    loggerInfoMock.mockClear()
  })

  it('uses a dedicated short title-generation request', async () => {
    const title = await generateTitle(
      '早上好啊小家伙，我又给你加了点新东西😄',
      { id: 'model-1' } as AccountModel,
      { apiUrl: 'https://example.com', apiKey: 'key' } as ProviderAccount,
      {
        id: 'provider-1',
        displayName: 'Provider 1',
        adapterPluginId: 'openai-chat-compatible-adapter'
      } as ProviderDefinition
    )

    expect(title).toBe('Generated title')
    expect(unifiedChatRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      stream: false,
      options: {
        maxTokens: 32,
        thinking: { enabled: false }
      },
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

  it('sanitizes provider reasoning overrides for title-generation requests', async () => {
    await generateTitle(
      '优化标题生成',
      { id: 'model-1' } as AccountModel,
      { apiUrl: 'https://example.com', apiKey: 'key' } as ProviderAccount,
      {
        id: 'provider-1',
        displayName: 'Provider 1',
        adapterPluginId: 'openai-chat-compatible-adapter',
        requestOverrides: {
          temperature: 0.2,
          thinking: { type: 'enabled' },
          reasoning: { effort: 'high' },
          reasoning_effort: 'high',
          output_config: {
            effort: 'max',
            customFlag: true
          }
        }
      } as ProviderDefinition
    )

    expect(unifiedChatRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        thinking: { enabled: false }
      }),
      requestOverrides: {
        temperature: 0.2,
        output_config: {
          customFlag: true
        }
      }
    }), null, expect.any(Function), expect.any(Function))
  })
})
