/**
 * 重试装饰器
 * 提供带重试功能的异步执行包装器
 */

import type { RetryConfig } from '..'

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  initialDelay: 1000, // 1秒
  backoffFactor: 2,   // 指数退避
  maxDelay: 10000     // 最大10秒
}

/**
 * 带重试的异步执行
 * @param fn 要执行的异步函数
 * @param config 重试配置
 * @returns 执行结果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config }
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error

      // 如果是最后一次尝试，直接抛出错误
      if (attempt === finalConfig.maxRetries) {
        throw lastError
      }

      // 计算延迟时间（指数退避）
      const delay = Math.min(
        finalConfig.initialDelay * Math.pow(finalConfig.backoffFactor, attempt),
        finalConfig.maxDelay
      )

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * 判断错误是否可重试
 * @param error 错误对象
 * @returns 是否可重试
 */
export function isRetriableError(error: Error): boolean {
  // 网络错误、超时错误可重试
  if (
    error.name === 'TypeError' && // 网络错误通常是 TypeError
    (error.message.includes('fetch') || error.message.includes('network'))
  ) {
    return true
  }

  if (
    error.name === 'AbortError' ||
    error.message.includes('timeout') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ECONNRESET')
  ) {
    return true
  }

  return false
}
