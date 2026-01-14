/**
 * Command Tool Type Definitions
 * 命令执行工具的类型定义
 */

// ============================================
// Risk Assessment
// ============================================

export type RiskLevel = 'safe' | 'warning' | 'dangerous'

// ============================================
// Execute Command
// ============================================

export interface ExecuteCommandArgs {
  command: string
  cwd?: string
  timeout?: number
  env?: Record<string, string>
  confirmed?: boolean // 用户是否已确认（内部使用）
}

export interface ExecuteCommandResponse {
  success: boolean
  command?: string // 执行的命令
  stdout?: string
  stderr?: string
  exit_code?: number
  execution_time?: number
  error?: string
  // 如果需要用户确认
  requires_confirmation?: boolean
  risk_level?: RiskLevel
  risk_reason?: string
}
