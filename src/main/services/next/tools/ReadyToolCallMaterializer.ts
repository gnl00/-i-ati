/**
 * ReadyToolCallMaterializer
 *
 * 放置内容：
 * - 把 `ToolCallReadyFact` 物化成 `ReadyToolCall`
 *
 * 业务逻辑边界：
 * - 输入是当前 step 的上下文和稳定的 ready fact
 * - 输出是可进入 `ToolBatchAssembler` 的稳定 tool call 输入
 * - 它不组装 batch，不执行工具，也不写 transcript
 */
import type { ReadyToolCall } from './ReadyToolCall'
import type { ToolCallReadyFact } from './ToolCallReadyFact'

export interface ReadyToolCallMaterializerInput {
  stepId: string
  fact: ToolCallReadyFact
}

export interface ReadyToolCallMaterializer {
  materialize(input: ReadyToolCallMaterializerInput): ReadyToolCall
}

export class DefaultReadyToolCallMaterializer implements ReadyToolCallMaterializer {
  materialize(input: ReadyToolCallMaterializerInput): ReadyToolCall {
    return {
      toolCallId: input.fact.toolCall.id,
      index: input.fact.toolCall.index ?? 0,
      name: input.fact.toolCall.function.name,
      arguments: input.fact.toolCall.function.arguments
    }
  }
}
