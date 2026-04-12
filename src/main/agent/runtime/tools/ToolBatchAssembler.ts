/**
 * ToolBatchAssembler
 *
 * 放置内容：
 * - 把单个 step 中已经 ready 的 tool calls 组装成可执行的 ToolBatch
 *
 * 业务逻辑边界：
 * - 输入是稳定的 ready tool calls，而不是流式 parser chunk
 * - 它负责 batch id、call ordering、confirmation policy 绑定
 * - 它不执行工具，也不写 transcript
 */
import type { ToolBatch } from './ToolBatch'
import type { ReadyToolCall } from './ReadyToolCall'
import type { LoopIdentityProvider } from '../loop/LoopIdentityProvider'
import type { ToolConfirmationPolicy } from './ToolConfirmationPolicy'

export interface ToolBatchAssemblerInput {
  stepId: string
  createdAt: number
  readyToolCalls: ReadyToolCall[]
}

export interface ToolBatchAssembler {
  assemble(input: ToolBatchAssemblerInput): ToolBatch
}

export interface DefaultToolBatchAssemblerOptions {
  resolveConfirmationPolicy?: (toolName: string) => ToolConfirmationPolicy
}

const DEFAULT_CONFIRMATION_POLICY: ToolConfirmationPolicy = {
  mode: 'not_required'
}

export class DefaultToolBatchAssembler implements ToolBatchAssembler {
  constructor(
    private readonly loopIdentityProvider: LoopIdentityProvider,
    private readonly options: DefaultToolBatchAssemblerOptions = {}
  ) {}

  assemble(input: ToolBatchAssemblerInput): ToolBatch {
    const calls = [...input.readyToolCalls]
      .sort((left, right) => left.index - right.index)
      .map((call) => ({
        toolCallId: call.toolCallId,
        stepId: input.stepId,
        index: call.index,
        name: call.name,
        arguments: call.arguments,
        confirmationPolicy: this.options.resolveConfirmationPolicy?.(call.name) ?? DEFAULT_CONFIRMATION_POLICY,
        status: 'pending' as const
      }))

    return {
      batchId: this.loopIdentityProvider.nextToolBatchId(),
      stepId: input.stepId,
      createdAt: input.createdAt,
      calls
    }
  }
}
