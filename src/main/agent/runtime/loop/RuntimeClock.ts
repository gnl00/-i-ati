/**
 * RuntimeClock
 *
 * 放置内容：
 * - agent runtime 在 bootstrap 和 loop 过程中使用的稳定时间来源
 *
 * 业务逻辑边界：
 * - 它负责提供 runtime contract 使用的时间戳
 * - 它不负责生成业务标识
 * - 它由 `AgentRuntime` 负责 wiring，供 bootstrap 和 loop 共用
 */
export interface RuntimeClock {
  now(): number
}

export class SystemRuntimeClock implements RuntimeClock {
  now(): number {
    return Date.now()
  }
}
