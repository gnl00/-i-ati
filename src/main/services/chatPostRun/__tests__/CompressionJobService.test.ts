import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RUN_EVENTS } from '@shared/chatRun/events'

const { emitterInstances, compressionExecuteMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  compressionExecuteMock: vi.fn(async () => ({ success: true }))
}))

vi.mock('@main/services/chatRun/infrastructure', () => {
  class ChatRunEventEmitter {
    emit = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class ChatRunEventEmitterFactory {
    create() {
      return new ChatRunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }) {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return { ChatRunEventEmitter, ChatRunEventEmitterFactory }
})

vi.mock('@main/services/DatabaseService', () => ({
  default: {
    getChatById: vi.fn()
  }
}))

vi.mock('@main/services/compression-service', () => ({
  compressionService: {
    execute: compressionExecuteMock
  }
}))

import { CompressionJobService } from '../CompressionJobService'

const args = {
  submissionId: 'submission-1',
  chatEntity: {
    id: 1,
    uuid: 'chat-1',
    title: 'NewChat',
    messages: [],
    model: 'model-1',
    workspacePath: './workspaces/chat-1',
    userInstruction: '',
    createTime: 1,
    updateTime: 1
  },
  messageBuffer: [
    {
      id: 101,
      body: {
        role: 'user',
        content: 'hello',
        segments: []
      }
    }
  ],
  content: 'hello',
  modelContext: {
    model: { id: 'model-1', label: 'model-1', type: 'llm' },
    account: { id: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
    providerDefinition: { id: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
  }
} as any

const config = {
  compression: {
    enabled: true,
    autoCompress: true,
    triggerThreshold: 1,
    compressCount: 1,
    keepRecentCount: 0
  }
} as any

describe('CompressionJobService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    compressionExecuteMock.mockReset()
    compressionExecuteMock.mockResolvedValue({ success: true })
  })

  it('emits completed when compression succeeds', async () => {
    const service = new CompressionJobService()

    await service.run(args, config)

    expect(compressionExecuteMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.COMPRESSION_STARTED, {
      messageCount: args.messageBuffer.length
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.COMPRESSION_COMPLETED, {
      result: { success: true }
    })
  })

  it('emits failed when compression returns an error result', async () => {
    const service = new CompressionJobService()
    compressionExecuteMock.mockResolvedValueOnce({
      success: false,
      error: 'compression failed'
    } as any)

    await service.run(args, config)

    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(CHAT_RUN_EVENTS.COMPRESSION_FAILED, {
      error: {
        name: 'CompressionError',
        message: 'compression failed'
      },
      result: {
        success: false,
        error: 'compression failed'
      }
    })
  })
})
