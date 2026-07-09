/**
 * 轮询等待条件成立。
 *
 * 使用递归 setTimeout 而非 setInterval：只有在上一次 checkFn 完成之后才排下一轮，
 * 避免 checkFn（如 executeJavaScript）耗时超过 interval 时的重入 —— 多个在途
 * 检查会并发压向同一 webContents，并与 clearInterval 时机竞态。
 *
 * 总超时由独立于 checkFn 的硬定时器 hardTimer 控制：即便 checkFn 因 renderer 卡死
 * 永久 pending（如 executeJavaScript 永不 resolve），hardTimer 仍会按时触发 reject，
 * 避免调用方持有的资源（如窗口池 permit）永久泄漏。
 *
 * @param checkFn 异步条件判断，返回 true 即 resolve
 * @param timeout 总超时（毫秒），独立硬定时器计时
 * @param interval 两次检查之间的间隔（毫秒）
 * @param signal 可选的取消信号；已 aborted 立即 reject，触发 abort 事件时 reject
 */
export function waitForCondition(
  checkFn: () => Promise<boolean>,
  timeout: number,
  interval: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let pollTimer: NodeJS.Timeout | null = null

    const onAbort = signal
      ? (): void => finish(reject, new Error('Aborted waiting for condition'))
      : null

    const finish = (fn: (arg?: any) => void, arg?: any): void => {
      if (settled) return
      settled = true
      if (pollTimer) clearTimeout(pollTimer)
      clearTimeout(hardTimer)
      if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      fn(arg)
    }

    const hardTimer = setTimeout(
      () => finish(reject, new Error('Timeout waiting for condition')),
      timeout
    )

    if (signal?.aborted) {
      finish(reject, new Error('Aborted waiting for condition'))
      return
    }
    if (onAbort) signal!.addEventListener('abort', onAbort)

    const tick = async (): Promise<void> => {
      if (settled) return
      let ok = false
      try {
        ok = await checkFn()
      } catch (e) {
        finish(reject, e)
        return
      }
      if (settled) return
      if (ok) {
        finish(resolve)
        return
      }
      pollTimer = setTimeout(tick, interval)
    }

    void tick()
  })
}
