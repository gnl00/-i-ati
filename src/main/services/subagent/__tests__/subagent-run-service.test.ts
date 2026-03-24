import { describe, expect, it, vi } from 'vitest'
import { SubagentRegistry } from '../subagent-registry'

vi.mock('../subagent-runtime-factory', () => ({
  SubagentRuntimeFactory: class {}
}))

vi.mock('electron', () => ({
  app: {
    isReady: () => false,
    getPath: () => '/tmp'
  }
}))

import { SubagentRunService } from '../subagent-run-service'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('SubagentRunService', () => {
  it('spawns and completes a subagent run', async () => {
    const runDeferred = deferred<{ summary: string, artifacts: { tools_used: string[], files_touched: string[] } }>()
    const service = new SubagentRunService(
      new SubagentRegistry(),
      {
        run: vi.fn(() => runDeferred.promise)
      } as any
    )

    const record = await service.spawn({
      task: 'Inspect plugin loading flow',
      role: 'researcher',
      contextMode: 'minimal',
      files: [],
      chatUuid: 'chat-1',
      modelRef: {
        accountId: 'acc-1',
        modelId: 'model-1'
      }
    })

    expect(record.status).toBe('queued')

    runDeferred.resolve({
      summary: 'Found the loading path.',
      artifacts: {
        tools_used: ['grep', 'read'],
        files_touched: []
      }
    })

    const waited = await service.wait(record.id, 1000)
    expect(waited?.status).toBe('completed')
    expect(waited?.summary).toBe('Found the loading path.')
    expect(waited?.artifacts?.tools_used).toEqual(['grep', 'read'])
  })

  it('surfaces failed subagent runs', async () => {
    const service = new SubagentRunService(
      new SubagentRegistry(),
      {
        run: vi.fn(async () => {
          throw new Error('subagent exploded')
        })
      } as any
    )

    const record = await service.spawn({
      task: 'Break intentionally',
      role: 'general',
      contextMode: 'minimal',
      files: [],
      chatUuid: 'chat-1',
      modelRef: {
        accountId: 'acc-1',
        modelId: 'model-1'
      }
    })

    const waited = await service.wait(record.id, 1000)
    expect(waited?.status).toBe('failed')
    expect(waited?.error).toContain('subagent exploded')
  })
})
