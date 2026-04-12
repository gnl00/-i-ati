/**
 * AssistantStepRecordMaterializer
 *
 * 放置内容：
 * - 把 `AgentStep` 物化成可写入 transcript 的稳定 `assistant_step` record
 *
 * 业务逻辑边界：
 * - 它只负责 write-back record 的生成
 * - 它不决定 step 是否可见，也不决定 loop 是否继续下一轮
 * - 它和 `ToolResultRecordMaterializer` 一起构成 transcript write-back bridge
 */
import type { AgentStep } from '../step/AgentStep'
import type { AgentTranscriptAssistantStepRecord } from './AgentTranscriptRecord'

export interface AssistantStepRecordMaterializerInput {
  recordId: string
  timestamp: number
  step: AgentStep
}

export interface AssistantStepRecordMaterializer {
  materialize(
    input: AssistantStepRecordMaterializerInput
  ): AgentTranscriptAssistantStepRecord
}

export class DefaultAssistantStepRecordMaterializer
implements AssistantStepRecordMaterializer {
  materialize(
    input: AssistantStepRecordMaterializerInput
  ): AgentTranscriptAssistantStepRecord {
    return {
      recordId: input.recordId,
      kind: 'assistant_step',
      timestamp: input.timestamp,
      step: input.step
    }
  }
}
