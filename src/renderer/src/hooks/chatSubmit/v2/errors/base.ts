/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  Low = 'low',       // 低：不影响核心功能
  Medium = 'medium', // 中：影响部分功能
  High = 'high',     // 高：影响核心功能
  Critical = 'critical' // 严重：系统无法继续
}

/**
 * 错误上下文
 */
export interface ErrorContext {
  [key: string]: any
}

/**
 * 统一错误基类
 */
export abstract class BaseError extends Error {
  public readonly timestamp: number
  public readonly severity: ErrorSeverity
  public readonly context: ErrorContext

  constructor(
    message: string,
    severity: ErrorSeverity = ErrorSeverity.Medium,
    context: ErrorContext = {}
  ) {
    super(message)
    this.name = this.constructor.name
    this.timestamp = Date.now()
    this.severity = severity
    this.context = context

    // 保持正确的原型链
    Object.setPrototypeOf(this, new.target.prototype)
  }

  /**
   * 转换为 JSON 格式（用于日志记录）
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      severity: this.severity,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    }
  }
}
