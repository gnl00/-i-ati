/**
 * LoopIdentityProvider
 *
 * 放置内容：
 * - next runtime 在 bootstrap 和 loop 过程中使用的稳定标识分配接口
 *
 * 业务逻辑边界：
 * - 它负责生成 runtime contract 需要的稳定业务标识
 * - 它不负责时间戳
 * - 它由 `NextAgentRuntime` 负责 wiring，供 bootstrap 和 loop 共用
 */
import { randomUUID } from 'node:crypto'

export interface LoopIdentityProvider {
  nextTranscriptId(): string
  nextStepId(): string
  nextTranscriptRecordId(): string
  nextToolBatchId(): string
}

export class DefaultLoopIdentityProvider implements LoopIdentityProvider {
  nextTranscriptId(): string {
    return `next_transcript_${randomUUID()}`
  }

  nextStepId(): string {
    return `next_step_${randomUUID()}`
  }

  nextTranscriptRecordId(): string {
    return `next_record_${randomUUID()}`
  }

  nextToolBatchId(): string {
    return `next_batch_${randomUUID()}`
  }
}
