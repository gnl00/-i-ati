import { invokeChatSubmit, invokeChatSubmitCancel, subscribeChatSubmitEvents } from '@renderer/invoker/ipcInvoker'
import { AbortError } from '../../errors'
import { SegmentBuilder } from '../streaming/parser'
import { extractContentFromSegments } from '../streaming/segment-utils'
import type { SubmissionContext } from '../context'
import type { EventPublisher } from '../event-publisher'
import type { ChatSubmitEventMeta, ChatSubmitEventType } from '../events'
import type { MessageService } from './message-service'
import type { StreamingService } from './streaming-service'

type MainEventEnvelope = {
  type: ChatSubmitEventType
  payload: any
  submissionId: string
  chatId?: number
  chatUuid?: string
  sequence: number
  timestamp: number
}

type MainStreamingOutcome = {
  ok: boolean
  error?: Error
  aborted?: boolean
}

export class MainDrivenStreamingService implements StreamingService {
  constructor(private readonly messageService: MessageService) {}

  async run(
    context: SubmissionContext,
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): Promise<SubmissionContext> {
    if (!context.request) {
      throw new Error('Missing request in submission context')
    }

    const submissionId = meta.submissionId
    const metaWithChat = {
      ...meta,
      chatId: context.session.currChatId,
      chatUuid: context.session.chatEntity.uuid
    }

    let pendingOutcome: MainStreamingOutcome | null = null

    const unsubscribe = subscribeChatSubmitEvents((event: MainEventEnvelope) => {
      if (event.submissionId !== submissionId) {
        return
      }

      switch (event.type) {
        case 'stream.started':
        case 'stream.completed':
        case 'tool.call.detected':
        case 'tool.exec.started':
        case 'tool.exec.completed':
        case 'tool.exec.failed':
        case 'submission.aborted':
        case 'submission.failed': {
          void publisher.emit(event.type, event.payload, metaWithChat)
          break
        }
        case 'tool.call.flushed': {
          void publisher.emit('tool.call.flushed', event.payload, metaWithChat)
          const toolCalls = event.payload?.toolCalls || []
          const content = extractContentFromSegments(
            this.getLastAssistantMessage(context).body.segments
          )
          void this.messageService.addToolCallMessage(context, toolCalls, content, publisher, metaWithChat)
          break
        }
        case 'tool.result.attached': {
          const toolMessage = event.payload?.message as MessageEntity | undefined
          if (toolMessage) {
            this.attachToolResultMessage(context, toolMessage)
            void publisher.emit('tool.result.attached', {
              toolCallId: toolMessage.body.toolCallId || '',
              message: toolMessage
            }, metaWithChat)
          }
          break
        }
        case 'tool.call.attached': {
          break
        }
        default: {
          void publisher.emit(event.type, event.payload, metaWithChat)
        }
      }

      if (event.type === 'stream.chunk') {
        this.applyDeltaToAssistant(context, event.payload, publisher, metaWithChat)
      }

      if (event.type === 'submission.failed') {
        const error = this.normalizeError(event.payload?.error)
        pendingOutcome = { ok: false, error }
      }

      if (event.type === 'submission.aborted') {
        pendingOutcome = { ok: false, aborted: true }
      }

      if (event.type === 'stream.completed') {
        pendingOutcome = pendingOutcome || { ok: true }
      }
    })

    const abortListener = () => {
      void invokeChatSubmitCancel({ submissionId, reason: 'abort' })
    }

    context.control.signal.addEventListener('abort', abortListener)

    try {
      await publisher.emit('request.sent', { messageCount: context.request.messages.length }, metaWithChat)
      await invokeChatSubmit({
        submissionId,
        request: context.request,
        chatId: context.session.currChatId,
        chatUuid: context.session.chatEntity.uuid
      })

      await this.waitForCompletion(() => pendingOutcome)

      if (pendingOutcome?.aborted) {
        const abortError = new AbortError('Request aborted')
        ;(abortError as any).__fromMain = true
        throw abortError
      }

      if (pendingOutcome?.error) {
        ;(pendingOutcome.error as any).__fromMain = true
        throw pendingOutcome.error
      }

      return context
    } finally {
      context.control.signal.removeEventListener('abort', abortListener)
      unsubscribe()
    }
  }

  private applyDeltaToAssistant(
    context: SubmissionContext,
    payload: { contentDelta?: string; reasoningDelta?: string },
    publisher: EventPublisher,
    meta: ChatSubmitEventMeta
  ): void {
    const { contentDelta, reasoningDelta } = payload || {}
    if (!contentDelta && !reasoningDelta) {
      return
    }

    const segmentBuilder = new SegmentBuilder()
    this.messageService.updateLastAssistantMessage(context, (message) => {
      const segments = message.body.segments || []
      let nextSegments = [...segments]

      if (reasoningDelta && reasoningDelta.trim()) {
        nextSegments = segmentBuilder.appendSegment(nextSegments, reasoningDelta, 'reasoning')
      }

      if (contentDelta && contentDelta.trim()) {
        nextSegments = segmentBuilder.appendSegment(nextSegments, contentDelta, 'text')
      }

      return {
        ...message,
        body: {
          ...message.body,
          segments: nextSegments
        }
      }
    }, publisher, meta)
  }

  private getLastAssistantMessage(context: SubmissionContext): MessageEntity {
    const entities = context.session.messageEntities
    for (let i = entities.length - 1; i >= 0; i--) {
      if (entities[i].body.role === 'assistant') {
        return entities[i]
      }
    }
    throw new Error('No assistant message found')
  }

  private attachToolResultMessage(context: SubmissionContext, message: MessageEntity): void {
    const entities = context.session.messageEntities
    if (message.id && entities.some(existing => existing.id === message.id)) {
      return
    }

    entities.push(message)
    context.session.chatMessages = entities.map(entity => entity.body)

    if (message.id) {
      const chatMessages = context.session.chatEntity.messages || []
      if (!chatMessages.includes(message.id)) {
        context.session.chatEntity.messages = [...chatMessages, message.id]
      }
    }
  }

  private normalizeError(error: any): Error {
    if (!error) {
      return new Error('Unknown error')
    }
    const normalized = new Error(error.message || 'Unknown error')
    normalized.name = error.name || 'Error'
    if (error.stack) {
      normalized.stack = error.stack
    }
    return normalized
  }

  private waitForCompletion(getOutcome: () => MainStreamingOutcome | null): Promise<void> {
    return new Promise((resolve) => {
      const tick = () => {
        if (getOutcome()) {
          resolve()
          return
        }
        setTimeout(tick, 10)
      }
      tick()
    })
  }
}
