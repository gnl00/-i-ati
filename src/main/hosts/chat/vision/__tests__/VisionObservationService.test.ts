import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/app')
  },
  shell: {},
  BrowserWindow: vi.fn(),
  session: {},
  ipcMain: {}
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    saveMessage: vi.fn(),
    updateChat: vi.fn(),
    getChatById: vi.fn(),
    getChatByUuid: vi.fn(),
    getEmotionStateByChatId: vi.fn(),
    upsertEmotionState: vi.fn()
  }
}))

vi.mock('@main/services/emotion/EmotionInferenceService', () => ({
  default: {
    infer: vi.fn(async () => null)
  }
}))

import { VisionObservationService, type VisionObservationRequestFn } from '../VisionObservationService'
import { MESSAGE_SOURCE } from '@shared/messages/messageSources'

const chat = {
  id: 1,
  uuid: 'chat-1'
} as ChatEntity

const userMessage = {
  id: 101,
  chatId: 1,
  chatUuid: 'chat-1',
  body: {
    role: 'user',
    content: '',
    segments: []
  }
} as MessageEntity

const config = {
  accounts: [{
    id: 'account-1',
    providerId: 'provider-1',
    apiUrl: 'https://example.invalid/v1',
    apiKey: 'secret-key',
    models: [{
      id: 'vision-model',
      label: 'Vision Model',
      type: 'vlm'
    }]
  }],
  providerDefinitions: [{
    id: 'provider-1',
    adapterPluginId: 'openai-chat-compatible-adapter',
    requestOverrides: {
      temperature: 0.2
    }
  }],
  tools: {
    visionModel: {
      accountId: 'account-1',
      modelId: 'vision-model'
    }
  }
} as any

const createStore = () => ({
  persistVisionObservationMessage: vi.fn((
    chatEntity: ChatEntity,
    content: string,
    host?: ChatMessageHostMeta
  ): MessageEntity => ({
    id: 202,
    chatId: chatEntity.id,
    chatUuid: chatEntity.uuid,
    body: {
      role: 'user',
      source: MESSAGE_SOURCE.VISION_OBSERVATION,
      content,
      host,
      segments: []
    }
  }))
})

describe('VisionObservationService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends non-streaming multimodal request and persists hidden observation', async () => {
    const request = vi.fn<VisionObservationRequestFn>(async () => ({
      id: 'response-1',
      model: 'vision-model',
      timestamp: 1,
      content: 'Summary:\nA chart is visible.',
      finishReason: 'stop'
    }))
    const chatStepStore = createStore()
    const service = new VisionObservationService({
      appConfigStore: {
        requireConfig: vi.fn(() => config as IAppConfig)
      },
      modelContextResolver: {
        resolve: vi.fn(() => ({
          model: config.accounts[0].models[0],
          account: config.accounts[0],
          providerDefinition: config.providerDefinitions[0]
        }))
      },
      chatStepStore,
      request
    })

    const result = await service.observe({
      chat,
      userMessage,
      textCtx: 'What is in this image?',
      mediaCtx: ['data:image/png;base64,abc'],
      host: {
        type: 'telegram',
        direction: 'inbound',
        peerId: '123'
      }
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    expect(request.mock.calls[0][0]).toMatchObject({
      adapterPluginId: 'openai-chat-compatible-adapter',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'secret-key',
      model: 'vision-model',
      modelType: 'vlm',
      stream: false,
      requestOverrides: {
        temperature: 0.2
      }
    })
    const requestBody = request.mock.calls[0][0]
    expect(requestBody.messages[1]).toMatchObject({
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
          text: expect.stringContaining('What is in this image?')
        }
      ]
    })
    expect(chatStepStore.persistVisionObservationMessage).toHaveBeenCalledWith(
      chat,
      expect.stringContaining('<vision_observation image_ref="message:101" status="ok">'),
      expect.objectContaining({
        type: 'telegram'
      })
    )
    expect(result.body.source).toBe(MESSAGE_SOURCE.VISION_OBSERVATION)
    expect(result.body.content).toContain('A chart is visible.')
  })

  it('persists failed hidden observation when request fails', async () => {
    const chatStepStore = createStore()
    const service = new VisionObservationService({
      appConfigStore: {
        requireConfig: vi.fn(() => config as IAppConfig)
      },
      modelContextResolver: {
        resolve: vi.fn(() => ({
          model: config.accounts[0].models[0],
          account: config.accounts[0],
          providerDefinition: config.providerDefinitions[0]
        }))
      },
      chatStepStore,
      request: vi.fn(async () => {
        throw new Error([
          'network down',
          'apiKey=secret-key',
          'Authorization: Bearer sk-testsecretvalue123456',
          'https://cdn.example.invalid/image.png?X-Amz-Signature=signed-secret&token=url-token'
        ].join(' '))
      })
    })

    const result = await service.observe({
      chat,
      userMessage,
      textCtx: 'inspect',
      mediaCtx: ['data:image/png;base64,abc']
    })

    expect(result.body.source).toBe(MESSAGE_SOURCE.VISION_OBSERVATION)
    expect(result.body.content).toContain('status="failed"')
    expect(result.body.content).toContain('network down')
    expect(result.body.content).not.toContain('secret-key')
    expect(result.body.content).not.toContain('sk-testsecretvalue123456')
    expect(result.body.content).not.toContain('signed-secret')
    expect(result.body.content).not.toContain('url-token')
    expect(result.body.content).toContain('[REDACTED]')
  })

  it('aborts vision observation requests after the configured timeout', async () => {
    vi.useFakeTimers()
    const requestSignals: AbortSignal[] = []
    const chatStepStore = createStore()
    const service = new VisionObservationService({
      appConfigStore: {
        requireConfig: vi.fn(() => config as IAppConfig)
      },
      modelContextResolver: {
        resolve: vi.fn(() => ({
          model: config.accounts[0].models[0],
          account: config.accounts[0],
          providerDefinition: config.providerDefinitions[0]
        }))
      },
      chatStepStore,
      timeoutMs: 25,
      request: vi.fn((_request, signal) => {
        if (signal) {
          requestSignals.push(signal)
        }
        return new Promise<IUnifiedResponse>(() => {})
      })
    })

    const resultPromise = service.observe({
      chat,
      userMessage,
      textCtx: 'inspect',
      mediaCtx: ['data:image/png;base64,abc']
    })

    await vi.advanceTimersByTimeAsync(25)
    const result = await resultPromise

    expect(requestSignals[0]?.aborted).toBe(true)
    expect(result.body.source).toBe(MESSAGE_SOURCE.VISION_OBSERVATION)
    expect(result.body.content).toContain('status="failed"')
    expect(result.body.content).toContain('vision observation timed out after 25ms')
  })

  it('persists failed hidden observation when configured model lacks vision', async () => {
    const chatStepStore = createStore()
    const service = new VisionObservationService({
      appConfigStore: {
        requireConfig: vi.fn(() => ({
          ...config,
          accounts: [{
            ...config.accounts[0],
            models: [{
              id: 'text-model',
              label: 'Text Model',
              type: 'llm'
            }]
          }],
          tools: {
            visionModel: {
              accountId: 'account-1',
              modelId: 'text-model'
            }
          }
        } as IAppConfig))
      },
      modelContextResolver: {
        resolve: vi.fn(() => ({
          model: {
            id: 'text-model',
            label: 'Text Model',
            type: 'llm'
          } as AccountModel,
          account: config.accounts[0],
          providerDefinition: config.providerDefinitions[0]
        }))
      },
      chatStepStore,
      request: vi.fn()
    })

    const result = await service.observe({
      chat,
      userMessage,
      textCtx: 'inspect',
      mediaCtx: ['data:image/png;base64,abc']
    })

    expect(result.body.content).toContain('status="failed"')
    expect(result.body.content).toContain('vision model unavailable')
  })
})
