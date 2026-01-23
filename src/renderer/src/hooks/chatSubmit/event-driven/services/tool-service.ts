import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'

export type ToolExecutionResult = {
  toolCallId: string
  ok: boolean
  result?: unknown
  error?: Error
  cost?: number
}

export interface ToolService {
  execute(
    context: SubmissionContext,
    toolCalls: import('../../types').ToolCall[],
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<ToolExecutionResult[]>
}
