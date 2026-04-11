/**
 * ToolConfirmationPolicy
 *
 * 放置内容：
 * - tool 在执行前的确认策略定义
 *
 * 预期内容：
 * - 是否需要确认
 * - 确认来源或确认级别
 * - 被拒绝时 loop 应看到的稳定结果形态
 * - 等待确认和确认被拒绝时应触发的 runtime 事实
 *
 * 业务逻辑边界：
 * - 这是 runtime-native tool policy，不是 host UI 事件
 * - 它定义“执行前要不要确认”，不定义具体确认界面
 * - 确认被拒绝时，应能被规范化成稳定的 denied/aborted tool result
 */
export type ToolConfirmationSource = 'user' | 'host' | 'policy'

export interface ToolDeniedResultShape {
  status: 'denied' | 'aborted'
  message: string
  code?: string
}

export interface NoToolConfirmationPolicy {
  mode: 'not_required'
}

export interface RequiredToolConfirmationPolicy {
  mode: 'required'
  source: ToolConfirmationSource
  riskLevel?: 'warning' | 'dangerous'
  deniedResult: ToolDeniedResultShape
}

export type ToolConfirmationPolicy =
  | NoToolConfirmationPolicy
  | RequiredToolConfirmationPolicy
