import { HostOutputDispatcher, type HostOutputAdapter } from '../output/HostOutputDispatcher'
import { type AgentEvent, type AgentEventSink } from '@main/agent/contracts/HostRuntimeContracts'
import { HostRenderEventMapper } from './HostRenderEventMapper'
import type { HostRenderEventSink } from './HostRenderEventSink'

export class HostRenderEventForwarder implements AgentEventSink {
  private readonly adapters: HostOutputAdapter[]
  constructor(
    sinks: HostRenderEventSink[],
    private readonly mapper = new HostRenderEventMapper(),
    private readonly dispatcher = new HostOutputDispatcher(),
    requiredSinkCount = sinks.length
  ) {
    this.adapters = sinks.map((sink, index) => ({
      name: sink.constructor.name,
      required: index < requiredSinkCount,
      accepts: (output): boolean => output.kind === 'render',
      deliver: (output): void | Promise<void> => {
        if (output.kind === 'render') return sink.handle(output.event)
      }
    }))
  }

  async handle(event: AgentEvent): Promise<void> {
    const hostEvents = this.mapper.map(event)
    for (const hostEvent of hostEvents) {
      await this.dispatcher.dispatch({ kind: 'render', event: hostEvent }, this.adapters)
    }
  }
}
