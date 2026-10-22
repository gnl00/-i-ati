import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubagentRegistry } from '../subagent-registry'
import type { SubagentExecutionResult, SubagentSpawnInput } from '../types'

vi.mock('electron', () => ({ app: { isReady: (): boolean => false, getPath: (): string => '/tmp' } }))
import { SubagentRunService, SUBAGENT_LIMITS } from '../subagent-run-service'

const input = (parent = 'parent'): SubagentSpawnInput => ({
  task: 'inspect', role: 'researcher', contextMode: 'minimal', files: [],
  parentSubmissionId: parent, chatUuid: parent, modelRef: { accountId: 'account', modelId: 'model' }
})
const result: SubagentExecutionResult = { status: 'completed', summary: 'done', artifacts: { tools_used: ['read'], files_touched: [] } }
type Deferred = { promise: Promise<SubagentExecutionResult>; resolve: (value: SubagentExecutionResult) => void }
const deferred = (): Deferred => {
  let resolve!: (value: SubagentExecutionResult) => void
  const promise = new Promise<SubagentExecutionResult>(res => { resolve = res })
  return { promise, resolve }
}
const setup = (): { service: SubagentRunService; registry: SubagentRegistry; run: ReturnType<typeof vi.fn<(input: SubagentSpawnInput) => Promise<SubagentExecutionResult>>>; pending: Array<Deferred & { input: SubagentSpawnInput }> } => {
  const pending: Array<ReturnType<typeof deferred> & { input: SubagentSpawnInput }> = []
  const run = vi.fn((input: SubagentSpawnInput) => {
    const task = { ...deferred(), input }
    pending.push(task)
    return task.promise
  })
  const registry = new SubagentRegistry()
  const service = new SubagentRunService(registry, { run })
  return { service, registry, run, pending }
}
afterEach(() => vi.useRealTimers())

describe('subagent lifecycle', () => {
  it('rejects oversized UTF-8 initial tasks before creating or dispatching a run', async () => {
    const { service, registry, run } = setup()
    await expect(service.spawn({ ...input(), task: '字'.repeat(10923) })).rejects.toThrow('32 KiB')
    expect(registry.list('parent')).toEqual([])
    expect(run).not.toHaveBeenCalled()
  })

  it('cancels queued work without running it and holds active slots until cleanup settles', async () => {
    const { service, pending, run } = setup()
    const first = await service.spawn(input())
    await service.spawn(input())
    const queued = await service.spawn(input())
    expect(service.get(queued.id)?.status).toBe('queued')
    expect(service.cancel(queued.id)?.status).toBe('cancelled')
    expect(service.cancel(first.id)?.status).toBe('cancelling')
    expect(pending[0].input.signal?.aborted).toBe(true)
    expect(service.cancel(first.id)?.status).toBe('cancelling')
    pending[0].resolve(result)
    const stopped = await service.wait(first.id, 100)
    expect(stopped).toMatchObject({ status: 'cancelled', summary: 'done', artifacts: result.artifacts })
    expect(service.cancel(first.id)).toEqual(stopped)
    pending[1].resolve(result)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('limits global concurrency and skips a saturated parent without blocking another', async () => {
    const { service, pending, run } = setup()
    await service.spawn(input('a'))
    await service.spawn(input('a'))
    const queuedA = await service.spawn(input('a'))
    await service.spawn(input('b'))
    await service.spawn(input('c'))
    const queuedD = await service.spawn(input('d'))
    expect(run).toHaveBeenCalledTimes(SUBAGENT_LIMITS.global)
    pending[2].resolve(result)
    await service.wait(pending[2].input.subagentId!, 100)
    await Promise.resolve()
    expect(service.get(queuedA.id)?.status).toBe('queued')
    expect(service.get(queuedD.id)?.status).toBe('running')
    service.cancelForParent('a')
    expect(service.get(queuedA.id)?.status).toBe('cancelled')
    expect(pending.filter(task => task.input.chatUuid === 'a')).toHaveLength(2)
    pending.forEach(task => task.resolve(result))
  })

  it('rejects queue overflow without creating another task and shuts down all jobs', async () => {
    const { service, pending } = setup()
    for (let i = 0; i < SUBAGENT_LIMITS.perParent + SUBAGENT_LIMITS.queued; i++) await service.spawn(input())
    await expect(service.spawn(input())).rejects.toThrow('queue is full')
    const shutdown = service.shutdown()
    expect(pending).toHaveLength(SUBAGENT_LIMITS.perParent)
    pending.forEach(task => {
      expect(task.input.signal?.aborted).toBe(true)
      task.resolve(result)
    })
    await shutdown
    expect(service.hasPending()).toBe(false)
    await expect(service.spawn(input())).rejects.toThrow('stopping')
  })

  it('ends only the wait on abort or timeout and clears its timer and listener', async () => {
    vi.useFakeTimers()
    const registry = new SubagentRegistry()
    const record = registry.create({ task: 'inspect', role: 'general' })
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const aborted = expect(registry.wait(record.id, 10000, controller.signal)).rejects.toBe('stop waiting')
    controller.abort('stop waiting')
    await aborted
    expect(registry.get(record.id)?.status).toBe('queued')
    expect(vi.getTimerCount()).toBe(0)
    expect(remove).toHaveBeenCalledOnce()
    const wait = registry.wait(record.id, 50)
    await vi.advanceTimersByTimeAsync(50)
    expect((await wait)?.status).toBe('queued')
    const completedWait = registry.wait(record.id, 10000)
    registry.markCompleted(record.id, 'done', result.artifacts)
    expect((await completedWait)?.status).toBe('completed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps terminal results immutable and rejects cancellation before spawn', async () => {
    const { service, registry, pending, run } = setup()
    const controller = new AbortController()
    controller.abort('already stopped')
    await expect(service.spawn({ ...input(), signal: controller.signal })).rejects.toBe('already stopped')
    expect(run).not.toHaveBeenCalled()
    const task = await service.spawn(input())
    pending[0].resolve(result)
    const completed = await service.wait(task.id, 100)
    expect(registry.markFailed(task.id, 'late error')).toBeNull()
    expect(registry.markRunning(task.id)).toBeNull()
    expect(registry.get(task.id)).toEqual(completed)
  })
})
