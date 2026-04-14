import type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import { HostRenderEventMapper } from './HostRenderEventMapper'
import type { HostRenderEventSink } from './HostRenderEventSink'

export class HostRenderEventForwarder implements AgentEventSink {
  private readonly mapper = new HostRenderEventMapper()

  constructor(private readonly sinks: HostRenderEventSink[]) {}

  async handle(event: AgentEvent): Promise<void> {
    const hostEvents = this.mapper.map(event)
    for (const hostEvent of hostEvents) {
      for (const sink of this.sinks) {
        await sink.handle(hostEvent)
      }
    }
  }
}
