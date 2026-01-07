/**
 * ToolExecutor 错误类型定义
 */

/**
 * 工具执行超时错误
 */
export class ToolTimeoutError extends Error {
  constructor(toolName: string, timeout: number) {
    super(`Tool "${toolName}" timed out after ${timeout}ms`)
    this.name = 'ToolTimeoutError'
  }
}

/**
 * 工具执行错误（包装底层错误）
 */
export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly originalError: Error
  ) {
    super(`Tool "${toolName}" execution failed: ${originalError.message}`)
    this.name = 'ToolExecutionError'
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not registered`)
    this.name = 'ToolNotFoundError'
  }
}
