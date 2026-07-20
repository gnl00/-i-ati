import { beforeEach, describe, expect, it, vi } from 'vitest'
import { embeddedToolsRegistry } from '@tools/registry'
import { ToolResultCompactorRegistry } from '../ToolResultCompactorRegistry'
import { DefaultToolResultCompactionScheduler } from '../ToolResultCompactionScheduler'
import type { ToolResultCompactor } from '../contracts'

const mocks = vi.hoisted(() => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@main/db/chat', () => ({
  chatDb: {}
}))

vi.mock('@main/logging/LogService', () => ({
  createLogger: vi.fn(() => mocks.logger)
}))

const flushAsyncWork = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('DefaultToolResultCompactionScheduler', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reads metadata and persists an asynchronous compaction', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'configured-compactor'
      }
    })
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 3,
      compact: vi.fn().mockResolvedValue({
        content: 'compact',
        compactorId: 'configured-compactor',
        compactorVersion: 3,
        originalCharacters: 30,
        compactedCharacters: 7,
        estimatedTokens: 2,
        execution: {
          executionType: 'model',
          modelId: 'lite-model',
          promptVersion: 'web-fetch-v1',
          promptTokens: 20,
          completionTokens: 2,
          latencyMs: 30
        }
      })
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(51),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry([compactor])
    )

    scheduler.schedule({
      messageId: 12,
      args: {
        url: 'https://example.com'
      },
      rawContent: 'raw content that is long enough',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-1',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success',
        content: 'raw'
      }
    })
    await flushAsyncWork()

    expect(store.createPendingToolResultCompaction).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 12,
      level: 'balanced',
      compactorId: 'configured-compactor',
      compactorVersion: 3
    }))
    expect(store.markToolResultCompactionRunning).toHaveBeenCalledWith(51)
    expect(store.markToolResultCompactionReady).toHaveBeenCalledWith(
      51,
      'compact',
      7,
      2,
      expect.objectContaining({
        executionType: 'model',
        modelId: 'lite-model'
      })
    )
    expect(compactor.compact).toHaveBeenCalledWith(expect.objectContaining({
      args: {
        url: 'https://example.com'
      },
      modelInputPolicy: 'redact-secrets'
    }))
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'tool_result.compaction.ready',
      expect.objectContaining({
        compactionId: 51,
        compactedCharacters: 7
      })
    )
  })

  it('skips tools whose metadata does not enable compaction', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow'
    })
    const store = {
      createPendingToolResultCompaction: vi.fn(),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry()
    )

    scheduler.schedule({
      messageId: 12,
      rawContent: 'raw',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-1',
        toolCallIndex: 0,
        toolName: 'unconfigured_tool',
        status: 'success'
      }
    })
    await flushAsyncWork()

    expect(store.createPendingToolResultCompaction).not.toHaveBeenCalled()
  })

  it('returns and persists raw content when compaction has no size gain', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'configured-compactor'
      }
    })
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 1,
      compact: vi.fn().mockResolvedValue({
        content: 'expanded compact result',
        compactorId: 'configured-compactor',
        compactorVersion: 1,
        originalCharacters: 3,
        compactedCharacters: 23,
        estimatedTokens: 6,
        execution: {
          executionType: 'deterministic'
        }
      })
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(52),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry([compactor])
    )

    const resolution = await scheduler.resolve({
      messageId: 13,
      rawContent: 'raw',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-2',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success'
      }
    })

    expect(resolution).toEqual({
      content: 'raw',
      source: 'raw',
      reason: 'no_size_gain'
    })
    expect(store.markToolResultCompactionReady).toHaveBeenCalledWith(
      52,
      'raw',
      3,
      1,
      {
        executionType: 'deterministic'
      }
    )
    expect(store.markToolResultCompactionFailed).not.toHaveBeenCalled()
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'tool_result.compaction.skipped',
      expect.objectContaining({
        compactionId: 52,
        reason: 'no_size_gain'
      })
    )
  })

  it('resolves positive-gain compaction for immediate consumers', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'minimal',
        compactorId: 'configured-compactor'
      }
    })
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 1,
      compact: vi.fn().mockResolvedValue({
        content: 'compact',
        compactorId: 'configured-compactor',
        compactorVersion: 1,
        originalCharacters: 25,
        compactedCharacters: 7,
        estimatedTokens: 2,
        execution: {
          executionType: 'model',
          modelId: 'lite-model'
        }
      })
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(54),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry([compactor])
    )

    const resolution = await scheduler.resolve({
      messageId: 15,
      rawContent: 'raw content for resolution',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-4',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success'
      }
    })

    expect(resolution).toEqual({
      content: 'compact',
      source: 'compact',
      reason: 'compacted'
    })
    expect(store.markToolResultCompactionReady).toHaveBeenCalledWith(
      54,
      'compact',
      7,
      2,
      expect.objectContaining({
        executionType: 'model',
        modelId: 'lite-model'
      })
    )
  })

  it('marks compaction failures and resolves to raw content', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'configured-compactor'
      }
    })
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 1,
      compact: vi.fn().mockRejectedValue(Object.assign(new Error('failed'), {
        code: 'COMPACTOR_FAILED'
      }))
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(53),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry([compactor])
    )

    const resolution = await scheduler.resolve({
      messageId: 14,
      rawContent: 'raw fallback',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-3',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success'
      }
    })

    expect(resolution).toEqual({
      content: 'raw fallback',
      source: 'raw',
      reason: 'compaction_failed'
    })
    expect(store.markToolResultCompactionFailed).toHaveBeenCalledWith(53, 'COMPACTOR_FAILED')
    expect(mocks.logger.error).toHaveBeenCalledWith(
      'tool_result.compaction.failed',
      expect.objectContaining({
        compactionId: 53,
        errorCode: 'COMPACTOR_FAILED'
      })
    )
  })

  it('reuses an exact ready result when the atomic claim is already complete', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'configured-compactor',
        modelInputPolicy: 'redact-secrets'
      }
    })
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 1,
      compact: vi.fn()
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(60),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(false),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn(),
      getToolResultCompaction: vi.fn().mockReturnValue({
        status: 'ready',
        content: 'cached compact'
      })
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store as any,
      new ToolResultCompactorRegistry([compactor])
    )

    const resolution = await scheduler.resolve({
      messageId: 16,
      rawContent: 'raw content long enough',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-5',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success'
      }
    })

    expect(resolution).toEqual({
      content: 'cached compact',
      source: 'compact',
      reason: 'compacted'
    })
    expect(compactor.compact).not.toHaveBeenCalled()
    expect(store.markToolResultCompactionReady).not.toHaveBeenCalled()
  })

  it('shares one in-flight compaction for concurrent identical requests', async () => {
    vi.spyOn(embeddedToolsRegistry, 'getToolMetadata').mockReturnValue({
      capability: 'web',
      riskLevel: 'none',
      mutatesWorkspace: false,
      subagent: 'allow',
      resultCompaction: {
        enabled: true,
        level: 'balanced',
        compactorId: 'configured-compactor',
        modelInputPolicy: 'redact-secrets'
      }
    })
    let complete: ((output: Awaited<ReturnType<ToolResultCompactor['compact']>>) => void) | undefined
    const compactor: ToolResultCompactor = {
      id: 'configured-compactor',
      version: 1,
      compact: vi.fn(() => new Promise<Awaited<ReturnType<ToolResultCompactor['compact']>>>(resolve => {
        complete = resolve
      }))
    }
    const store = {
      createPendingToolResultCompaction: vi.fn().mockReturnValue(61),
      markToolResultCompactionRunning: vi.fn().mockReturnValue(true),
      markToolResultCompactionReady: vi.fn(),
      markToolResultCompactionFailed: vi.fn(),
      getToolResultCompaction: vi.fn()
    }
    const scheduler = new DefaultToolResultCompactionScheduler(
      store,
      new ToolResultCompactorRegistry([compactor])
    )
    const input = {
      messageId: 17,
      rawContent: 'raw content long enough',
      result: {
        stepId: 'step-1',
        toolCallId: 'call-6',
        toolCallIndex: 0,
        toolName: 'metadata_driven_tool',
        status: 'success' as const
      }
    }

    const first = scheduler.resolve(input)
    const second = scheduler.resolve(input)
    complete?.({
      content: 'compact',
      compactorId: 'configured-compactor',
      compactorVersion: 1,
      originalCharacters: 23,
      compactedCharacters: 7,
      estimatedTokens: 2,
      execution: {
        executionType: 'model'
      }
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      { content: 'compact', source: 'compact', reason: 'compacted' },
      { content: 'compact', source: 'compact', reason: 'compacted' }
    ])
    expect(compactor.compact).toHaveBeenCalledTimes(1)
    expect(store.createPendingToolResultCompaction).toHaveBeenCalledTimes(1)
  })
})
