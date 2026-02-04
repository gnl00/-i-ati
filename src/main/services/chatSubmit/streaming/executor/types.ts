/**
 * ToolExecutor 类型定义
 */

import type { ToolCallProps } from '../../types'

/**
 * 工具执行结果
 * 表示单个工具执行的结果
 */
export interface ToolExecutionResult {
  /** 工具调用 ID（用于匹配请求） */
  id: string
  /** 工具调用索引（用于唯一标识） */
  index: number
  /** 工具名称 */
  name: string
  /** 工具执行结果内容 */
  content: any
  /** 执行时间（毫秒） */
  cost: number
  /** 执行失败时的错误 */
  error?: Error
  /** 执行状态 */
  status: 'success' | 'error' | 'timeout' | 'aborted'
}

/**
 * 工具执行进度事件
 * 在工具执行期间触发，用于 UI 更新
 */
export interface ToolExecutionProgress {
  /** 工具调用 ID */
  id: string
  /** 工具名称 */
  name: string
  /** 进度阶段 */
  phase: 'started' | 'completed' | 'failed'
  /** 当前结果（如果已完成） */
  result?: ToolExecutionResult
}

/**
 * 工具执行器配置
 */
export interface ToolExecutorConfig {
  /** 最大并发工具执行数（默认: 3） */
  maxConcurrency?: number
  /** 进度回调，用于实时更新 */
  onProgress?: (progress: ToolExecutionProgress) => void
  /** 中止信号，用于取消 */
  signal?: AbortSignal
  /** 当前聊天 UUID（用于工具执行上下文） */
  chatUuid?: string
  /** 工具执行前确认回调（可用于计划审核） */
  requestConfirmation?: (request: {
    toolCallId: string
    name: string
    args?: unknown
    ui?: {
      title?: string
      riskLevel?: 'risky' | 'dangerous'
      reason?: string
      command?: string
    }
  }) => Promise<{ approved: boolean; reason?: string; args?: unknown }>
}

/**
 * 工具执行器接口
 */
export interface IToolExecutor {
  /**
   * 并发执行多个工具调用
   * @param calls 要执行的工具调用数组
   * @returns Promise，解析为执行结果数组
   */
  execute(calls: ToolCallProps[]): Promise<ToolExecutionResult[]>
}
