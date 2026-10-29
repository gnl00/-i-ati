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

  it('coalesces slow optional previews and drains them before stable output', async () => {
    const dispatcher = new HostOutputDispatcher()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const received: HostOutput[] = []
    const slow = adapter(async (value) => {
      received.push(value)
      if (received.length === 1) await barrier
    })
    const required = vi.fn()
    const canonical = adapter(required, true)
    const preview = (timestamp: number): HostOutput => ({
      kind: 'render', event: {
        type: 'host.preview.updated', timestamp, previewEffect: 'text_append',
        preview: { content: String(timestamp), blocks: [], toolCalls: [] }
      }
    })
    for (let i = 1; i <= 100; i++) {
      await dispatcher.dispatch(preview(i), [slow, canonical])
    }
    expect(required).toHaveBeenCalledTimes(100)
    expect(received).toHaveLength(1)
    let settled = false
    const terminal = dispatcher.dispatch(output, [slow, canonical]).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await terminal
    expect(received.map((value) => value.kind === 'render' && value.event.timestamp)).toEqual([1, 100, 1])
    expect(received[1]).toMatchObject({ event: { previewEffect: 'replace' } })
  })

  it('keeps previews after a stable barrier behind that barrier', async () => {
    const dispatcher = new HostOutputDispatcher()
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    const received: number[] = []
    const slow = adapter(async (value) => {
      if (value.kind !== 'render') return
      received.push(value.event.timestamp)
      if (received.length === 1) await barrier
    })
    const preview = (timestamp: number): HostOutput => ({ kind: 'render', event: {
      type: 'host.preview.updated', timestamp, previewEffect: 'replace',
      preview: { content: String(timestamp), blocks: [], toolCalls: [] }
    } })
    await dispatcher.dispatch(preview(10), [slow])
    const stable = dispatcher.dispatch(output, [slow])
    await dispatcher.dispatch(preview(20), [slow])
    const terminal = dispatcher.dispatch(output, [slow])
    release()
    await Promise.all([stable, terminal])
    expect(received).toEqual([10, 1, 20, 1])
  })

  it('isolates preview failures and still flushes the latest preview and terminal event', async () => {
    const report = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispatcher = new HostOutputDispatcher()
    const receive = vi.fn(async (value: HostOutput): Promise<void> => {
      if (value.kind === 'render' && value.event.type === 'host.preview.updated') {
        throw new Error('preview transport failed')
      }
    })
    const transport = adapter(receive)
    await dispatcher.dispatch({ kind: 'render', event: {
      type: 'host.preview.updated', timestamp: 1, previewEffect: 'replace',
      preview: { content: 'latest', blocks: [], toolCalls: [] }
    } }, [transport])
    await dispatcher.dispatch(output, [transport])
    expect(receive).toHaveBeenCalledTimes(2)
    expect(receive).toHaveBeenLastCalledWith(output)
    expect(report).toHaveBeenCalledOnce()
    report.mockRestore()
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
