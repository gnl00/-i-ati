import { createUserContextRecord } from '../../context/ContextRecords'
/**
 * LoopInputBootstrapper
 *
 * 放置内容：
 * - 把宿主原始请求规范化成 `AgentLoopInput`
 *
 * 业务逻辑边界：
 * - 它消费外部已生成的 run 标识，并把它带入 `AgentLoopInput`
 * - 它负责首条 user record 与启动 records 的装配
 * - 它消费外部已经解析好的 `AgentRequestSpec`
 * - 它可以装配 loop 启动所需的稳定执行配置
 * - 它不执行 loop，只负责生成 loop 启动入参
 */
import type { AgentLoopInput } from '../../loop/AgentLoopInput'
import type { LoopExecutionConfig } from '../../loop/LoopExecutionConfig'
import type { LoopRunDescriptor } from '../../loop/LoopRunDescriptor'
import type { AgentRequestSpec } from '../../request/AgentRequestSpec'
import type { RuntimeInfrastructure } from '../../RuntimeInfrastructure'
import type { HostRunRequest } from './HostRunRequest'

export interface LoopInputBootstrapperInput {
  hostRequest: HostRunRequest
  run: LoopRunDescriptor
  runtimeInfrastructure: RuntimeInfrastructure
  requestSpec: AgentRequestSpec
  execution?: LoopExecutionConfig
}

export interface LoopInputBootstrapper {
  bootstrap(input: LoopInputBootstrapperInput): AgentLoopInput
}

export class DefaultLoopInputBootstrapper implements LoopInputBootstrapper {
  bootstrap(input: LoopInputBootstrapperInput): AgentLoopInput {
    const now = input.runtimeInfrastructure.runtimeClock.now()
    const recordId = input.runtimeInfrastructure.loopIdentityProvider.nextTranscriptRecordId()

    const userRecord = createUserContextRecord({
      recordId,
      timestamp: now,
      content: input.hostRequest.userContent
    })

    return {
      run: input.run,
      records: [userRecord],
      requestSpec: input.requestSpec,
      execution: input.execution
    }
  }
}
