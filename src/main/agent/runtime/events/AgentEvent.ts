/**
 * AgentEvent
 *
 * 放置内容：
 * - agent runtime 的统一事件入口类型定义
 * - 作为 StepEvent / ToolEvent / LoopEvent 的联合出口
 *
 * 预期组成：
 * - StepEvent
 * - ToolEvent
 * - LoopEvent
 *
 * 约束：
 * - payload 必须是 runtime-native 事实
 * - 具体事件定义应优先放在分组文件中，而不是持续堆积在这里
 * - 不直接携带 chat message entity
 */
import type { LoopEvent } from './LoopEvent'
import type { StepEvent } from './StepEvent'
import type { ToolEvent } from './ToolEvent'

export type AgentEvent = StepEvent | ToolEvent | LoopEvent
