import type { ToolExecutionResult } from '../streaming/executor/types'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'

export interface ToolService {
  execute(
    context: SubmissionContext,
    toolCalls: import('../../types').ToolCall[],
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<ToolExecutionResult[]>
}
