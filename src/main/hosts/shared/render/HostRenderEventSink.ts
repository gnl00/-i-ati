import type { HostRenderEvent } from './HostRenderEvent'

export interface HostRenderEventSink {
  handle(event: HostRenderEvent): void | Promise<void>
}
