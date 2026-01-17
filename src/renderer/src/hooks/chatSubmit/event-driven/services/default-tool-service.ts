import { ToolExecutor } from '../streaming/executor'
import type { ToolExecutionProgress, ToolExecutionResult } from '../streaming/executor/types'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta } from '../events'
import type { ToolService } from './tool-service'

export class DefaultToolService implements ToolService {
  async execute(
    context: SubmissionContext,
    toolCalls: import('../../types').ToolCall[],
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<ToolExecutionResult[]> {
    const metaWithChat = {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    const seenProgress = new Set<string>()
    const executor = new ToolExecutor({
      maxConcurrency: 3,
      signal: context.control.signal,
      chatUuid: context.session.chatEntity.uuid,
      onProgress: (progress: ToolExecutionProgress) => {
        const progressKey = `${progress.id}:${progress.phase}`
        if (seenProgress.has(progressKey)) {
          return
        }
        seenProgress.add(progressKey)

        if (progress.phase === 'started') {
          void publisher.emit('tool.exec.started', {
            toolCallId: progress.id,
            name: progress.name
          }, metaWithChat)
          return
        }

        if (progress.phase === 'completed') {
          void publisher.emit('tool.exec.completed', {
            toolCallId: progress.id,
            result: progress.result?.content,
            cost: progress.result?.cost || 0
          }, metaWithChat)
          return
        }

        if (progress.phase === 'failed') {
          const error = progress.result?.error || new Error('Tool execution failed')
          void publisher.emit('tool.exec.failed', {
            toolCallId: progress.id,
            error
          }, metaWithChat)
        }
      }
    })

    const toolCallProps = toolCalls.map(tool => ({
      id: tool.id,
      index: tool.index,
      function: tool.name,
      args: tool.args
    }))

    return executor.execute(toolCallProps)
  }
}
