/**
 * ContextRecord
 *
 * 放置内容：
 * - AgentTranscript 中的单条 runtime record
 *
 * 预期类型：
 * - user
 * - assistant_step
 * - tool_result
 *
 * 业务逻辑边界：
 * - record 是 runtime-native 类型
 * - `assistant_step` record 应承载一个 `AgentStep`
 * - message entity 只可能是 output target，不是这里的 source
 */
import type { AgentStep } from '../step/AgentStep'
import type { ToolResultFact } from '../tools/ToolResultFact'
import type { AgentContentPart } from './ContextContentPart'

export interface ContextUserRecord {
  recordId: string
  kind: 'user'
  timestamp: number
  source?: string
  content: AgentContentPart[]
}

export type ContextToolResultRecord = ToolResultFact & {
  recordId: string
  kind: 'tool_result'
  timestamp: number
}

export interface ContextAssistantRecord {
  recordId: string
  kind: 'assistant_step'
  timestamp: number
  step: AgentStep
}

export type ContextRecord = ContextUserRecord | ContextAssistantRecord | ContextToolResultRecord
