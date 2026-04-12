/**
 * AgentLoopDependenciesFactory
 *
 * 放置内容：
 * - 把 runtime 已经持有的 bridges / providers / emitter 收敛成 `AgentLoopDependencies`
 *
 * 业务逻辑边界：
 * - 它只负责依赖映射与组装
 * - 它不负责 source resolve、bootstrap 或 loop 执行
 * - 它不引入新的 run state
 */
import type { AgentLoopDependencies } from './loop/AgentLoopDependencies'
import type { RuntimeInfrastructure } from './RuntimeInfrastructure'
import type { AgentEventBus } from './events/AgentEventBus'
import type { AgentEventEmitter } from './events/AgentEventEmitter'
import type { AgentStepMaterializer } from './step/AgentStepMaterializer'
import type { ReadyToolCallMaterializer } from './tools/ReadyToolCallMaterializer'
import type { ToolBatchAssembler } from './tools/ToolBatchAssembler'
import type { ToolExecutorDispatcher } from './tools/ToolExecutorDispatcher'
import type { DefaultToolExecutorDispatcherOptions } from './tools/ToolExecutorDispatcher'
import type { AssistantStepRecordMaterializer } from './transcript/AssistantStepRecordMaterializer'
import type { AgentTranscriptAppender } from './transcript/AgentTranscriptAppender'
import type { AgentTranscriptSnapshotMaterializer } from './transcript/AgentTranscriptSnapshotMaterializer'
import type { RequestMaterializer } from './transcript/RequestMaterializer'
import type { ToolResultRecordMaterializer } from './transcript/ToolResultRecordMaterializer'
import type { ExecutableRequestAdapter } from './model/ExecutableRequestAdapter'
import type { ModelResponseParser } from './model/ModelResponseParser'
import type { ModelStreamExecutor } from './model/ModelStreamExecutor'
import type { LoopBudgetPolicy } from './loop/LoopBudgetPolicy'
import { DefaultAgentEventBus } from './events/AgentEventBus'
import { DefaultAgentEventEmitter } from './events/AgentEventEmitter'
import { DefaultLoopBudgetPolicy } from './loop/LoopBudgetPolicy'
import { DefaultAgentStepMaterializer } from './step/AgentStepMaterializer'
import { DefaultReadyToolCallMaterializer } from './tools/ReadyToolCallMaterializer'
import { DefaultToolBatchAssembler } from './tools/ToolBatchAssembler'
import { DefaultToolExecutorDispatcher } from './tools/ToolExecutorDispatcher'
import { DefaultAssistantStepRecordMaterializer } from './transcript/AssistantStepRecordMaterializer'
import { DefaultAgentTranscriptAppender } from './transcript/AgentTranscriptAppender'
import { DefaultAgentTranscriptSnapshotMaterializer } from './transcript/AgentTranscriptSnapshotMaterializer'
import { DefaultRequestMaterializer } from './transcript/RequestMaterializer'
import { DefaultToolResultRecordMaterializer } from './transcript/ToolResultRecordMaterializer'
import { DefaultExecutableRequestAdapter } from './model/ExecutableRequestAdapter'
import { DefaultModelResponseParser } from './model/ModelResponseParser'
import { DefaultModelStreamExecutor } from './model/ModelStreamExecutor'

export interface AgentLoopDependenciesFactory {
  create(runtimeInfrastructure: RuntimeInfrastructure): AgentLoopDependencies
}

export interface DefaultAgentLoopDependenciesFactoryOptions {
  agentEventBus?: AgentEventBus
  agentEventEmitter?: AgentEventEmitter
  loopBudgetPolicy?: LoopBudgetPolicy
  agentStepMaterializer?: AgentStepMaterializer
  transcriptAppender?: AgentTranscriptAppender
  transcriptSnapshotMaterializer?: AgentTranscriptSnapshotMaterializer
  assistantStepRecordMaterializer?: AssistantStepRecordMaterializer
  requestMaterializer?: RequestMaterializer
  executableRequestAdapter?: ExecutableRequestAdapter
  modelStreamExecutor?: ModelStreamExecutor
  modelResponseParser?: ModelResponseParser
  readyToolCallMaterializer?: ReadyToolCallMaterializer
  toolBatchAssembler?: ToolBatchAssembler
  toolExecutorDispatcher?: ToolExecutorDispatcher
  toolResultRecordMaterializer?: ToolResultRecordMaterializer
  executeToolCalls?: DefaultToolExecutorDispatcherOptions['executeToolCalls']
  abortedResultDisposition?: DefaultToolExecutorDispatcherOptions['abortedResultDisposition']
  requestConfirmation?: DefaultToolExecutorDispatcherOptions['requestConfirmation']
}

export class DefaultAgentLoopDependenciesFactory
implements AgentLoopDependenciesFactory {
  constructor(
    private readonly options: DefaultAgentLoopDependenciesFactoryOptions = {}
  ) {}

  create(runtimeInfrastructure: RuntimeInfrastructure): AgentLoopDependencies {
    const agentEventBus = this.options.agentEventBus ?? new DefaultAgentEventBus()
    const agentEventEmitter = this.options.agentEventEmitter ?? new DefaultAgentEventEmitter(agentEventBus)

    return {
      loopIdentityProvider: runtimeInfrastructure.loopIdentityProvider,
      runtimeClock: runtimeInfrastructure.runtimeClock,
      loopBudgetPolicy: this.options.loopBudgetPolicy ?? new DefaultLoopBudgetPolicy(),
      agentStepMaterializer: this.options.agentStepMaterializer ?? new DefaultAgentStepMaterializer(),
      transcriptAppender: this.options.transcriptAppender ?? new DefaultAgentTranscriptAppender(),
      transcriptSnapshotMaterializer:
        this.options.transcriptSnapshotMaterializer ?? new DefaultAgentTranscriptSnapshotMaterializer(),
      assistantStepRecordMaterializer:
        this.options.assistantStepRecordMaterializer ?? new DefaultAssistantStepRecordMaterializer(),
      requestMaterializer: this.options.requestMaterializer ?? new DefaultRequestMaterializer(),
      executableRequestAdapter:
        this.options.executableRequestAdapter ?? new DefaultExecutableRequestAdapter(),
      modelStreamExecutor: this.options.modelStreamExecutor ?? new DefaultModelStreamExecutor(),
      modelResponseParser:
        this.options.modelResponseParser
        ?? new DefaultModelResponseParser(runtimeInfrastructure.runtimeClock),
      readyToolCallMaterializer:
        this.options.readyToolCallMaterializer ?? new DefaultReadyToolCallMaterializer(),
      toolBatchAssembler:
        this.options.toolBatchAssembler
        ?? new DefaultToolBatchAssembler(runtimeInfrastructure.loopIdentityProvider),
      toolExecutorDispatcher:
        this.options.toolExecutorDispatcher
        ?? new DefaultToolExecutorDispatcher({
          agentEventEmitter,
          runtimeClock: runtimeInfrastructure.runtimeClock,
          executeToolCalls: this.options.executeToolCalls,
          abortedResultDisposition: this.options.abortedResultDisposition,
          requestConfirmation: this.options.requestConfirmation
        }),
      toolResultRecordMaterializer:
        this.options.toolResultRecordMaterializer ?? new DefaultToolResultRecordMaterializer(),
      agentEventEmitter
    }
  }
}
