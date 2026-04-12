/**
 * AgentLoopDependencies
 *
 * 放置内容：
 * - `AgentLoop` 运行时真正消费的最小依赖面
 *
 * 业务逻辑边界：
 * - 它只列出 loop 自己直接使用的 bridges / emitter / id&time providers
 * - 它不重复包含 runtime sources 或 host bootstrap
 * - 它由 `AgentRuntime` 负责 wiring
 */
import type { AgentEventEmitter } from '../events/AgentEventEmitter'
import type { AgentStepMaterializer } from '../step/AgentStepMaterializer'
import type { ReadyToolCallMaterializer } from '../tools/ReadyToolCallMaterializer'
import type { ToolBatchAssembler } from '../tools/ToolBatchAssembler'
import type { ToolExecutorDispatcher } from '../tools/ToolExecutorDispatcher'
import type { AssistantStepRecordMaterializer } from '../transcript/AssistantStepRecordMaterializer'
import type { AgentTranscriptAppender } from '../transcript/AgentTranscriptAppender'
import type { AgentTranscriptSnapshotMaterializer } from '../transcript/AgentTranscriptSnapshotMaterializer'
import type { RequestMaterializer } from '../transcript/RequestMaterializer'
import type { ToolResultRecordMaterializer } from '../transcript/ToolResultRecordMaterializer'
import type { ExecutableRequestAdapter } from '../model/ExecutableRequestAdapter'
import type { ModelResponseParser } from '../model/ModelResponseParser'
import type { ModelStreamExecutor } from '../model/ModelStreamExecutor'
import type { LoopIdentityProvider } from './LoopIdentityProvider'
import type { RuntimeClock } from './RuntimeClock'
import type { LoopBudgetPolicy } from './LoopBudgetPolicy'

export interface AgentLoopDependencies {
  loopIdentityProvider: LoopIdentityProvider
  runtimeClock: RuntimeClock
  loopBudgetPolicy: LoopBudgetPolicy
  agentStepMaterializer: AgentStepMaterializer
  transcriptAppender: AgentTranscriptAppender
  transcriptSnapshotMaterializer: AgentTranscriptSnapshotMaterializer
  assistantStepRecordMaterializer: AssistantStepRecordMaterializer
  requestMaterializer: RequestMaterializer
  executableRequestAdapter: ExecutableRequestAdapter
  modelStreamExecutor: ModelStreamExecutor
  modelResponseParser: ModelResponseParser
  readyToolCallMaterializer: ReadyToolCallMaterializer
  toolBatchAssembler: ToolBatchAssembler
  toolExecutorDispatcher: ToolExecutorDispatcher
  toolResultRecordMaterializer: ToolResultRecordMaterializer
  agentEventEmitter: AgentEventEmitter
}
