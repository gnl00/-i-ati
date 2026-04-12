/**
 * ToolBatch
 *
 * 放置内容：
 * - 一个 step 内从模型输出中解析出来的 tool call 集合
 * - 保留 tool id、arguments、排序、状态
 * - 保留 confirmation policy 等 tool-level 规则
 * - 保留后续回传模型所需的执行结果上下文
 *
 * 业务逻辑边界：
 * - 是 runtime-native tool batch，不是用户可见消息
 * - 它描述“要执行什么”以及“执行后要如何接回模型上下文”
 */
import type { ToolConfirmationPolicy } from './ToolConfirmationPolicy'

export type ToolBatchCallStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'denied'

export interface ToolBatchCall {
  toolCallId: string
  stepId: string
  index: number
  name: string
  arguments: string
  confirmationPolicy: ToolConfirmationPolicy
  status: ToolBatchCallStatus
}

export interface ToolBatch {
  batchId: string
  stepId: string
  createdAt: number
  calls: ToolBatchCall[]
}
