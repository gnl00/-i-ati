/**
 * FIFO 信号量，用于对有限资源（如窗口池）做并发限流与排队。
 *
 * 释放时直接把 permit「过户」给队首等待者（而非先 permits++ 再让其自减），
 * 避免惊群与计数抖动。容量为 1 时即互斥锁（AsyncMutex）。
 */
export class Semaphore {
  private permits: number
  private waiters: Array<() => void> = []

  constructor(permits: number) {
    this.permits = Math.max(0, permits)
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }
    await new Promise<void>(resolve => this.waiters.push(resolve))
  }

  release(): void {
    const next = this.waiters.shift()
    if (next) {
      next()
    } else {
      this.permits++
    }
  }

  get available(): number {
    return this.permits
  }

  get pending(): number {
    return this.waiters.length
  }
}
