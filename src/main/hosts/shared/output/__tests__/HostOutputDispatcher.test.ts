import { describe, expect, it, vi } from 'vitest'
import {
  HostOutputDispatcher,
  type HostOutput,
  type HostOutputAdapter
} from '../HostOutputDispatcher'

const output: HostOutput = {
  kind: 'render',
  event: { type: 'host.preview.cleared', timestamp: 1 }
}
const adapter = (deliver: HostOutputAdapter['deliver'], required = false): HostOutputAdapter => ({
  name: 'test',
  accepts: (value) => value.kind === 'render',
  deliver,
  required
})

describe('HostOutputDispatcher', () => {
  it('isolates synchronous and asynchronous transport failures and still delivers to siblings', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const receive = vi.fn()
    await new HostOutputDispatcher().dispatch(output, [
      adapter(() => {
        throw new Error('IPC closed')
      }),
      adapter(async () => {
        throw new Error('Telegram offline')
      }),
      adapter(receive)
    ])
    expect(receive).toHaveBeenCalledWith(output)
    vi.restoreAllMocks()
  })

  it('surfaces persistence failures after starting independent host deliveries', async () => {
    const receive = vi.fn()
    await expect(
      new HostOutputDispatcher().dispatch(output, [
        adapter(async () => {
          throw new Error('DB failed')
        }, true),
        adapter(receive)
      ])
    ).rejects.toThrow('DB failed')
    expect(receive).toHaveBeenCalledWith(output)
  })

  it('preserves each transport order across overlapping events without blocking other adapters', async () => {
    const dispatcher = new HostOutputDispatcher()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    const calls: number[] = []
    const slow = adapter(async (value) => {
      if (value.kind !== 'render') return
      calls.push(value.event.timestamp)
      if (value.event.timestamp === 1) await barrier
    })
    const fast = vi.fn()
    const first = dispatcher.dispatch(output, [slow, adapter(fast)])
    const second = dispatcher.dispatch(
      { kind: 'render', event: { type: 'host.preview.cleared', timestamp: 2 } },
      [slow]
    )
    expect(calls).toEqual([1])
    expect(fast).toHaveBeenCalledOnce()
    release()
    await Promise.all([first, second])
    expect(calls).toEqual([1, 2])
  })

  it('filters routes and removes registered adapters without changing run adapters', async () => {
    const dispatcher = new HostOutputDispatcher()
    const registered = vi.fn()
    const remove = dispatcher.register(adapter(registered))
    dispatcher.register({
      name: 'approval',
      accepts: (value) => value.kind === 'confirmation',
      deliver: vi.fn(() => {
        throw new Error('wrong route')
      })
    })
    await dispatcher.dispatch(output)
    remove()
    const run = vi.fn()
    await dispatcher.dispatch(output, [adapter(run)])
    expect(registered).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledOnce()
  })
})
