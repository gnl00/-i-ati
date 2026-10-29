import type { RunEventEnvelope } from '@shared/run/events'
import type { TelegramConfirmationTarget, ToolConfirmation } from '@shared/tools/confirmation'
import type { HostRenderEvent } from '../render/HostRenderEvent'

export type HostOutput =
  | { kind: 'render'; event: HostRenderEvent }
  | { kind: 'run'; event: RunEventEnvelope }
  | {
      kind: 'confirmation'
      confirmation: ToolConfirmation
      targets: readonly TelegramConfirmationTarget[]
    }

export type HostOutputAdapter = {
  name: string
  /** Required consumers own canonical persistence; transport consumers are isolated. */
  required?: boolean
  accepts: (output: HostOutput) => boolean
  deliver: (output: HostOutput) => void | Promise<void>
}

/** One routing boundary for mapped render facts, run protocols and canonical approvals. */
export class HostOutputDispatcher {
  private readonly adapters = new Set<HostOutputAdapter>()
  private readonly previews = new WeakMap<HostOutputAdapter, {
    latest?: HostOutput
    delivery?: Promise<void>
  }>()
  private readonly pending = new WeakMap<HostOutputAdapter, Promise<void>>()

  register(adapter: HostOutputAdapter): () => void {
    this.adapters.add(adapter)
    return () => {
      this.adapters.delete(adapter)
    }
  }

  async dispatch(
    output: HostOutput,
    runAdapters: readonly HostOutputAdapter[] = []
  ): Promise<void> {
    const required: Promise<void>[] = []
    const deliveries: Promise<void>[] = []
    for (const adapter of [...this.adapters, ...runAdapters]) {
      try {
        if (!adapter.accepts(output)) continue
        if (adapter.required) {
          required.push(Promise.resolve(adapter.deliver(output)))
          continue
        }
        if (output.kind === 'render' && output.event.type === 'host.preview.updated') {
          // Optional previews carry a complete snapshot; skipped append effects must become replace.
          this.enqueuePreview(adapter, {
            kind: 'render', event: { ...output.event, previewEffect: 'replace' }
          })
          continue
        }
        const deliver = (): void | Promise<void> => adapter.deliver(output)
        const previous = this.pending.get(adapter)
        const result = previous ? previous.then(deliver) : deliver()
        if (result && typeof result.then === 'function') {
          const delivery = result.catch((error) => this.report(adapter, error))
          deliveries.push(delivery)
          this.track(adapter, delivery)
        }
      } catch (error) {
        if (adapter.required) required.push(Promise.reject(error))
        else this.report(adapter, error)
      }
    }
    await Promise.all([...required, ...deliveries])
  }

  private enqueuePreview(adapter: HostOutputAdapter, output: HostOutput): void {
    const previous = this.pending.get(adapter)
    const existing = this.previews.get(adapter)
    if (existing && existing.delivery === previous) {
      existing.latest = output
      return
    }
    const state: { latest?: HostOutput; delivery?: Promise<void> } = { latest: output }
    const delivery = (previous ?? Promise.resolve()).then(async () => {
      while (state.latest) {
        const latest = state.latest
        state.latest = undefined
        try {
          await adapter.deliver(latest)
        } catch (error) {
          this.report(adapter, error)
        }
      }
    })
    state.delivery = delivery
    this.previews.set(adapter, state)
    this.track(adapter, delivery)
    void delivery.then(() => {
      if (this.previews.get(adapter) === state) this.previews.delete(adapter)
    })
  }

  private track(adapter: HostOutputAdapter, delivery: Promise<void>): void {
    this.pending.set(adapter, delivery)
    void delivery.then(() => {
      if (this.pending.get(adapter) === delivery) this.pending.delete(adapter)
    })
  }

  private report(adapter: HostOutputAdapter, error: unknown): void {
    console.warn(`[HostOutputDispatcher] ${adapter.name} delivery failed`, error)
  }
}
