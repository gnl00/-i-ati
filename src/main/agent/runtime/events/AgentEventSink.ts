/**
 * AgentEventSink
 *
 * 放置内容：
 * - runtime 事件消费接口
 *
 * 业务逻辑边界：
 * - chat、telegram、scheduler、debug tracer 等都可以实现这个接口
 * - AgentLoop 不关心 sink 的宿主类型
 * - sink 可以只消费部分事件，不要求所有宿主都理解完整事件集
 */
import type { AgentEvent } from './AgentEvent'

export interface AgentEventSink {
  handle(event: AgentEvent): void | Promise<void>
}
