/**
 * NextAgentRuntime
 *
 * 放置内容：
 * - next runtime 的 composition root
 * - 把 sources、bootstrap、loop 和 loop dependencies 组装起来
 *
 * 业务逻辑边界：
 * - 它是接入层，不是核心状态机
 * - 它负责 wiring，不负责新增 host / provider 业务策略
 * - 它不应维护独立于 AgentLoop 之外的运行中状态
 * - 它的返回值只表达稳定终态；运行中的事件应通过 `events/` 侧向发出
 *
 * 预期顺序：
 * 1. 接收 `NextAgentRuntimeRunInput`
 * 2. 通过 runtime sources resolve `AgentRequestSpec`
 * 3. 通过 runtime sources create `LoopRunDescriptor`
 * 4. 调用 `LoopInputBootstrapper` 生成 `AgentLoopInput`
 * 5. 调用 `AgentLoop` 并返回最终 `AgentLoopResult`
 */
import type { AgentLoopResult } from '../loop/AgentLoopResult'
import type { NextAgentRuntimeRunInput } from './NextAgentRuntimeRunInput'
import type { NextAgentRuntimeContext } from './NextAgentRuntimeContext'

export interface NextAgentRuntime {
  run(input: NextAgentRuntimeRunInput): Promise<AgentLoopResult>
}

export class DefaultNextAgentRuntime implements NextAgentRuntime {
  constructor(private readonly context: NextAgentRuntimeContext) {}

  async run(input: NextAgentRuntimeRunInput): Promise<AgentLoopResult> {
    const requestSpec = await this.context.requestSpecSource.resolve(input)
    const run = await this.context.runDescriptorSource.create(input)
    const loopInput = this.context.loopInputBootstrapper.bootstrap({
      hostRequest: input.hostRequest,
      run,
      runtimeInfrastructure: this.context.runtimeInfrastructure,
      userRecordMaterializer: this.context.userRecordMaterializer,
      initialTranscriptMaterializer: this.context.initialTranscriptMaterializer,
      requestSpec,
      execution: input.execution
    })
    const dependencies = this.context.agentLoopDependenciesFactory.create(
      this.context.runtimeInfrastructure
    )

    return this.context.agentLoop.run(
      {
        ...loopInput,
        signal: input.signal
      },
      dependencies
    )
  }
}
