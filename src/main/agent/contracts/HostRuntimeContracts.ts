/**
 * HostRuntimeContracts
 *
 * 放置内容：
 * - `hosts/` 消费 agent core 的唯一公开入口
 * - 对 `agent/runtime/*` 中 host 真正需要的类型与投影函数的显式 re-export
 *
 * 业务逻辑边界：
 * - 这里只做 re-export，不新增定义、不新增行为、不承接 host 语义
 * - 定义仍留在 `agent/runtime/*`；把它们物理搬进 contracts 需要单独评估依赖方向
 * - `hosts/` 只允许 import `@main/agent/contracts*`，深路径 import 由
 *   `pnpm run check:main-boundaries` 拦截
 * - 这里出现的每个名字都应能被论证为「host 确实要消费的稳定事实」；
 *   新增 re-export 等于扩大 core 的公开面，需要一并评审
 */
export type { AgentEvent } from '@main/agent/runtime/events/AgentEvent'
export type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'

export type { AgentStep, AgentStepFailureInfo } from '@main/agent/runtime/step/AgentStep'

export type {
  ContextAssistantRecord,
  ContextRecord,
  ContextToolResultRecord,
  ContextUserRecord
} from '@main/agent/runtime/context/ContextRecord'
export type { AgentContentPart } from '@main/agent/runtime/context/ContextContentPart'

export type {
  ToolResultFact,
  ToolDeniedFact,
  ToolFailureFact
} from '@main/agent/runtime/tools/ToolResultFact'
export {
  projectToolResultContentForDisplay,
  projectToolResultContentForHistoryImport
} from '@main/agent/runtime/tools/ToolResultContentProjector'

export type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'
export type { AgentLoopInput } from '@main/agent/runtime/loop/AgentLoopInput'
export type { LoopIdentityProvider } from '@main/agent/runtime/loop/LoopIdentityProvider'

export type { HostRunRequest } from '@main/agent/runtime/host/bootstrap/HostRunRequest'
export type {
  LoopInputBootstrapper,
  LoopInputBootstrapperInput
} from '@main/agent/runtime/host/bootstrap/LoopInputBootstrapper'

export type {
  AgentSteeringContext,
  AgentSteeringMessage,
  SteeringMessageSource
} from '@main/agent/runtime/steering/SteeringMessageSource'

export type {
  LoadedSkillsTranscriptContextProvider,
  LoadedSkillsTranscriptContextProviderInput
} from '@main/agent/runtime/skills/LoadedSkillsTranscriptContextProvider'

export type { ToolOutputBatch } from '@shared/run/tool-events'

export { createUserContextRecord } from '@main/agent/runtime/context/ContextRecords'
