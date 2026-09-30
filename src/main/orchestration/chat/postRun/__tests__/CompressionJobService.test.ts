import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RUN_EVENTS } from '@shared/run/events'
import type { PostRunJobInput } from '../types'

const { emitterInstances, compressionMock, strategyMock, summariesMock } = vi.hoisted(() => ({
  emitterInstances: [] as Array<{ emit: ReturnType<typeof vi.fn> }>,
  compressionMock: vi.fn(async () => ({ success: true })),
  strategyMock: vi.fn(),
  summariesMock: vi.fn()
}))

vi.mock('@main/orchestration/chat/run/infrastructure', () => {
  class RunEventEmitter {
    emit = vi.fn()

    constructor() {
      emitterInstances.push(this)
    }
  }

  class RunEventEmitterFactory {
    create(): RunEventEmitter {
      return new RunEventEmitter()
    }

    createOptional(meta: { submissionId?: string }): RunEventEmitter | null {
      if (!meta.submissionId) {
        return null
      }
      return this.create()
    }
  }

  return { RunEventEmitter, RunEventEmitterFactory }
})

vi.mock('@main/db/chat', () => ({
  chatDb: {
    getActiveCompressedSummariesByChatId: summariesMock
  }
}))

vi.mock('@main/orchestration/chat/maintenance/MessageCompressionService', () => ({
  compressionService: {
    compress: compressionMock,
    analyzeCompressionStrategy: strategyMock
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
    modelRef: {
      accountId: 'account-1',
      modelId: 'model-1'
    },
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
    account: { id: 'account-1', label: 'account-1', providerId: 'provider-1', apiUrl: 'https://example.com', apiKey: 'key', models: [] },
    providerDefinition: { id: 'provider-1', displayName: 'provider-1', adapterPluginId: 'openai-chat-compatible-adapter' }
  }
} as PostRunJobInput

const config = {
  compression: {
    enabled: true,
    autoCompress: true,
    triggerTokenRatio: 0.7
  }
} as IAppConfig

describe('CompressionJobService', () => {
  beforeEach(() => {
    emitterInstances.length = 0
    compressionMock.mockReset()
    compressionMock.mockResolvedValue({ success: true })
    strategyMock.mockReset()
    strategyMock.mockReturnValue({ shouldCompress: true })
    summariesMock.mockReset()
    summariesMock.mockReturnValue([])
  })

  it('plans compression using the current history, active summaries and model strategy', () => {
    const summaries = [{ messageIds: [100] }]
    summariesMock.mockReturnValue(summaries)
    const service = new CompressionJobService()

    expect(service.shouldRun(args, config)).toBe(true)
    expect(summariesMock).toHaveBeenCalledWith(1)
    expect(strategyMock).toHaveBeenCalledWith(
      args.messageBuffer, summaries, args.modelContext.model, config.compression
    )
  })

  it('skips planning and emits no maintenance events when the strategy does not need compression', async () => {
    strategyMock.mockReturnValue({ shouldCompress: false })
    const service = new CompressionJobService()

    expect(service.shouldRun(args, config)).toBe(false)
    await service.run(args, config)

    expect(compressionMock).not.toHaveBeenCalled()
    expect(emitterInstances).toHaveLength(0)
  })

  it.each([
    { compression: { ...config.compression, enabled: false } },
    { compression: { ...config.compression, autoCompress: false } },
    {}
  ])('skips strategy evaluation when automatic compression is disabled: %j', disabledConfig => {
    expect(new CompressionJobService().shouldRun(args, disabledConfig as IAppConfig)).toBe(false)
    expect(summariesMock).not.toHaveBeenCalled()
    expect(strategyMock).not.toHaveBeenCalled()
  })

  it('skips strategy evaluation without a persisted chat', () => {
    expect(new CompressionJobService().shouldRun({
      ...args, chatEntity: { ...args.chatEntity, id: undefined }
    }, config)).toBe(false)
    expect(summariesMock).not.toHaveBeenCalled()
  })

  it('emits completed when compression succeeds', async () => {
    const service = new CompressionJobService()

    await service.run(args, config)

    expect(compressionMock).toHaveBeenCalledTimes(1)
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_STARTED, {
      messageCount: args.messageBuffer.length
    })
    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_COMPLETED, {
      result: { success: true }
    })
  })

  it('emits failed when compression returns an error result', async () => {
    const service = new CompressionJobService()
    compressionMock.mockResolvedValueOnce({
      success: false,
      error: 'compression failed'
    } as CompressionResult)

    await service.run(args, config)

    expect(emitterInstances[0]?.emit).toHaveBeenCalledWith(RUN_EVENTS.COMPRESSION_FAILED, {
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
