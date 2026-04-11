/**
 * NextAgentRuntimeContext
 *
 * 放置内容：
 * - 启动 next runtime 所需的上下文输入
 *
 * 依赖分组：
 * - sources
 * - bootstrap
 * - runtime infrastructure
 * - loop
 * - loop dependencies factory
 *
 * 业务逻辑边界：
 * - 它提供启动输入，不承担运行中状态
 * - 它不应退化成任意宿主数据的大杂烩
 * - 它不应直接承载 chat identity 或 host output config
 */
import type { LoopInputBootstrapper } from '../host/bootstrap/LoopInputBootstrapper'
import type { AgentLoop } from '../loop/AgentLoop'
import type { LoopRunDescriptor } from '../loop/LoopRunDescriptor'
import type { AgentRequestSpec } from '../request/AgentRequestSpec'
import type { AgentLoopDependenciesFactory } from './AgentLoopDependenciesFactory'
import type { NextAgentRuntimeRunInput } from './NextAgentRuntimeRunInput'
import type { RuntimeInfrastructure } from './RuntimeInfrastructure'
import type { InitialTranscriptMaterializer } from '../transcript/InitialTranscriptMaterializer'
import type { UserRecordMaterializer } from '../transcript/UserRecordMaterializer'

export interface AgentRequestSpecSource {
  resolve(input: NextAgentRuntimeRunInput): AgentRequestSpec | Promise<AgentRequestSpec>
}

export interface LoopRunDescriptorSource {
  create(input: NextAgentRuntimeRunInput): LoopRunDescriptor | Promise<LoopRunDescriptor>
}

export interface NextAgentRuntimeContext {
  // sources
  requestSpecSource: AgentRequestSpecSource
  runDescriptorSource: LoopRunDescriptorSource

  // bootstrap
  loopInputBootstrapper: LoopInputBootstrapper
  userRecordMaterializer: UserRecordMaterializer
  initialTranscriptMaterializer: InitialTranscriptMaterializer

  // runtime infrastructure
  runtimeInfrastructure: RuntimeInfrastructure

  // loop
  agentLoop: AgentLoop

  // loop dependencies factory
  agentLoopDependenciesFactory: AgentLoopDependenciesFactory
}
