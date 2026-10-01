import type { HostRenderEvent } from './HostRenderEvent'

export interface HostRenderEventSink {
  /** Main owns persistence and UI updates for transport delivery receipts. */
  connectToolResultUpdates?(update: (toolCallId: string, content: unknown) => boolean): void
  handle(event: HostRenderEvent): void | Promise<void>
}
