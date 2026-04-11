/**
 * AgentEventBus
 *
 * 放置内容：
 * - runtime 内部事件分发器
 * - 管理多个 AgentEventSink
 *
 * 业务逻辑边界：
 * - 只做事件广播和最小协调
 * - 不内嵌业务规则
 * - 不把稳定 step result 降级成 host-specific payload
 */
import type { AgentEvent } from './AgentEvent'
import type { AgentEventSink } from './AgentEventSink'

export interface AgentEventBus {
  register(sink: AgentEventSink): void
  emit(event: AgentEvent): void | Promise<void>
}

export class DefaultAgentEventBus implements AgentEventBus {
  private readonly sinks: AgentEventSink[] = []

  register(sink: AgentEventSink): void {
    this.sinks.push(sink)
  }

  async emit(event: AgentEvent): Promise<void> {
    for (const sink of this.sinks) {
      await sink.handle(event)
    }
  }
}
