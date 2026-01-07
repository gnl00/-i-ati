/**
 * 超时装饰器
 * 提供带超时控制的异步执行包装器
 */

/**
 * 超时错误类
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * 带超时的异步执行
 * @param fn 要执行的异步函数
 * @param timeoutMs 超时时间（毫秒）
 * @returns 执行结果
 * @throws TimeoutError 如果超时
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  // 创建超时 Promise
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // 清理定时器（如果函数在超时前完成）
    timeoutPromise.catch(() => clearTimeout(timer))
  })

  // 竞速：函数完成 vs 超时
  return Promise.race([fn(), timeoutPromise])
}
