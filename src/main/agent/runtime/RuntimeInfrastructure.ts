/**
 * RuntimeInfrastructure
 *
 * 放置内容：
 * - bootstrap 和 loop 共享使用的稳定基础设施 contract
 *
 * 业务逻辑边界：
 * - 它只承载共享的 identity / time providers
 * - 它不承载 request source、bootstrap、loop 或 event bus
 * - 它用于把“必须复用同一份实例”这件事提升成显式 contract
 */
import type { LoopIdentityProvider } from './loop/LoopIdentityProvider'
import type { RuntimeClock } from './loop/RuntimeClock'
import { DefaultLoopIdentityProvider } from './loop/LoopIdentityProvider'
import { SystemRuntimeClock } from './loop/RuntimeClock'

export interface RuntimeInfrastructure {
  loopIdentityProvider: LoopIdentityProvider
  runtimeClock: RuntimeClock
}

export const createDefaultRuntimeInfrastructure = (): RuntimeInfrastructure => ({
  loopIdentityProvider: new DefaultLoopIdentityProvider(),
  runtimeClock: new SystemRuntimeClock()
})
