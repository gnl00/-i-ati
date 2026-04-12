import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'

const { emitterInstances, generateTitleMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  generateTitleMock: vi.fn(async () => 'generated title')
}))

vi.mock('@main/orchestration/chat/run/infrastructure', () => {
  class RunEventEmitter {
    emit = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class RunEventEmitterFactory {
    create() {
      return new RunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return { RunEventEmitter, RunEventEmitterFactory }
})

vi.mock('@main/request/index', () => ({
  unifiedChatRequest: vi.fn()
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}))

import { TitleGenerationService } from '../TitleGenerationService'

const input = {
  submissionId: 'submission-1',
  chatId: 1,
  chatUuid: 'chat-1',
  content: 'generate title',
  model: { id: 'model-1', label: 'model-1', type: 'llm' },
  account: { id: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
  providerDefinition: { id: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
} as any

describe('TitleGenerationService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    generateTitleMock.mockReset()
    generateTitleMock.mockResolvedValue('generated title')
  })

  it('emits started/completed around title generation', async () => {
    const service = new TitleGenerationService(undefined, generateTitleMock)

    const result = await service.generate(input)

    expect(result).toEqual({ title: 'generated title' })
    expect(generateTitleMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_STARTED, {
      model: input.model,
      contentLength: input.content.length
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_COMPLETED, {
      title: 'generated title'
    })
  })

  it('emits failed when title generation throws', async () => {
    const service = new TitleGenerationService(undefined, generateTitleMock)
    generateTitleMock.mockRejectedValueOnce(new Error('title boom'))

    await expect(service.generate(input)).rejects.toThrow('title boom')
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.TITLE_GENERATION_FAILED, {
      error: expect.objectContaining({
        name: 'Error',
        message: 'title boom'
      })
    })
  })
})
