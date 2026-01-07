import { BaseError, ErrorSeverity } from './base'

/**
 * 请求中止错误
 */
export class AbortError extends BaseError {
  constructor(message: string = 'Request aborted') {
    super(message, ErrorSeverity.Low)
  }
}

/**
 * 网络错误基类
 */
export class NetworkError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, ErrorSeverity.High, context)
  }
}

/**
 * 请求超时错误
 */
export class RequestTimeoutError extends NetworkError {
  constructor(timeout: number) {
    super(`Request timed out after ${timeout}ms`, { timeout })
  }
}

/**
 * 连接错误
 */
export class ConnectionError extends NetworkError {
  constructor(message: string, originalError?: Error) {
    super(message, { originalError: originalError?.message })
  }
}

/**
 * 数据库错误基类
 */
export class DatabaseError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, ErrorSeverity.High, context)
  }
}

/**
 * 保存错误
 */
export class SaveError extends DatabaseError {
  constructor(entity: string, originalError?: Error) {
    super(`Failed to save ${entity}`, {
      entity,
      originalError: originalError?.message
    })
  }
}

/**
 * 查询错误
 */
export class QueryError extends DatabaseError {
  constructor(entity: string, originalError?: Error) {
    super(`Failed to query ${entity}`, {
      entity,
      originalError: originalError?.message
    })
  }
}

/**
 * 解析错误基类
 */
export class ParserError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, ErrorSeverity.Medium, context)
  }
}

/**
 * Chunk 解析错误
 */
export class ChunkParseError extends ParserError {
  constructor(chunkData: any, originalError?: Error) {
    super('Failed to parse chunk', {
      chunkData,
      originalError: originalError?.message
    })
  }
}

/**
 * 消息解析错误
 */
export class MessageParseError extends ParserError {
  constructor(messageData: any, originalError?: Error) {
    super('Failed to parse message', {
      messageData,
      originalError: originalError?.message
    })
  }
}

/**
 * 工具错误基类
 */
export class ToolError extends BaseError {
  constructor(
    public readonly toolName: string,
    message: string,
    context?: any
  ) {
    super(message, ErrorSeverity.Medium, { toolName, ...context })
  }
}

/**
 * 工具未找到错误
 */
export class ToolNotFoundError extends ToolError {
  constructor(toolName: string) {
    super(toolName, `Tool "${toolName}" is not registered`)
  }
}

/**
 * 工具超时错误
 */
export class ToolTimeoutError extends ToolError {
  constructor(toolName: string, timeout: number) {
    super(
      toolName,
      `Tool "${toolName}" timed out after ${timeout}ms`,
      { timeout }
    )
  }
}

/**
 * 工具执行错误
 */
export class ToolExecutionError extends ToolError {
  constructor(toolName: string, originalError: Error) {
    super(
      toolName,
      `Tool "${toolName}" execution failed: ${originalError.message}`,
      { originalError: originalError.message }
    )
  }
}

/**
 * 工具验证错误
 */
export class ToolValidationError extends ToolError {
  constructor(toolName: string, reason: string) {
    super(
      toolName,
      `Tool "${toolName}" validation failed: ${reason}`,
      { reason }
    )
  }
}

/**
 * 验证错误基类
 */
export class ValidationError extends BaseError {
  constructor(message: string, context?: any) {
    super(message, ErrorSeverity.Medium, context)
  }
}

/**
 * 输入验证错误
 */
export class InputValidationError extends ValidationError {
  constructor(field: string, reason: string) {
    super(`Invalid input for field "${field}": ${reason}`, { field, reason })
  }
}

/**
 * 状态验证错误
 */
export class StateValidationError extends ValidationError {
  constructor(state: string, reason: string) {
    super(`Invalid state "${state}": ${reason}`, { state, reason })
  }
}
