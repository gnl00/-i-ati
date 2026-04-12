import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'

const { emitterInstances, compressionExecuteMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  compressionExecuteMock: vi.fn(async () => ({ success: true }))
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

vi.mock('../MessageCompressionService', () => ({
  compressionService: {
    execute: compressionExecuteMock
  }
}))

import { CompressionExecutionService } from '../CompressionExecutionService'

const input = {
  submissionId: 'submission-1',
  chatId: 1,
  chatUuid: 'chat-1',
  messages: [{ id: 1 }] as any,
  model: { id: 'model-1', label: 'model-1', type: 'llm' },
  account: { id: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
  providerDefinition: { id: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
} as any

describe('CompressionExecutionService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    compressionExecuteMock.mockReset()
    compressionExecuteMock.mockResolvedValue({ success: true })
  })

  it('emits started/completed around compression execution', async () => {
    const service = new CompressionExecutionService()

    const result = await service.execute(input)

    expect(result).toEqual({ success: true })
    expect(compressionExecuteMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_STARTED, {
      chatId: 1,
      chatUuid: 'chat-1',
      messageCount: 1
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_COMPLETED, {
      result: { success: true }
    })
  })

  it('emits failed when compression throws', async () => {
    const service = new CompressionExecutionService()
    compressionExecuteMock.mockRejectedValueOnce(new Error('compression boom'))

    await expect(service.execute(input)).rejects.toThrow('compression boom')
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_FAILED, {
      error: expect.objectContaining({
        name: 'Error',
        message: 'compression boom'
      })
    })
  })
})
