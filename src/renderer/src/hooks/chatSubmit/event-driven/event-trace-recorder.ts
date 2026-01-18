import { saveChatSubmitEvent } from '@renderer/db/ChatSubmitEventRepository'
import { logger } from '../logger'
import type {
  ChatSubmitEventEnvelope,
  ChatSubmitEventPayloads,
  ChatSubmitEventType
} from './events'
import type { EventPublisherHandler } from './event-publisher'
import type { ChatSubmitEventBus } from './bus'

const TRACE_EVENT_TYPES: ChatSubmitEventType[] = [
  'submission.started',
  'submission.aborted',
  'submission.failed',
  'submission.completed',
  'session.ready',
  'messages.loaded',
  'message.created',
  'request.built',
  'request.sent',
  'stream.started',
  'stream.completed',
  'tool.call.detected',
  'tool.call.flushed',
  'tool.call.attached',
  'tool.exec.started',
  'tool.exec.completed',
  'tool.exec.failed',
  'tool.result.attached',
  'tool.result.persisted',
  'chat.updated'
]

export class ChatSubmitEventTraceRecorder {
  private unsubscribers: Array<() => void> = []
  private queue: Promise<void> = Promise.resolve()
  private closed = false

  bind(bus: ChatSubmitEventBus): () => void {
    const handlerFactory = <T extends ChatSubmitEventType>(type: T) => {
      const handler: EventPublisherHandler<T> = (payload, envelope) => {
        if (this.closed) {
          return
        }
        void this.enqueue(type, payload, envelope)
      }
      return handler
    }

    for (const type of TRACE_EVENT_TYPES) {
      this.unsubscribers.push(bus.on(type, handlerFactory(type as any)))
    }

    return () => this.close()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.unsubscribers.forEach(unsub => unsub())
    this.unsubscribers = []
  }

  private enqueue<T extends ChatSubmitEventType>(
    type: T,
    payload: ChatSubmitEventPayloads[T],
    envelope: ChatSubmitEventEnvelope<T>
  ): void {
    const trace: ChatSubmitEventTrace = {
      submissionId: envelope.submissionId,
      chatId: envelope.chatId,
      chatUuid: envelope.chatUuid,
      sequence: envelope.sequence,
      type,
      timestamp: envelope.timestamp,
      payload,
      meta: envelope.cycle ? { cycle: envelope.cycle } : undefined
    }

    this.queue = this.queue
      .then(() => saveChatSubmitEvent(trace))
      .catch((error) => {
        logger.warn('Failed to save chat submit event trace', error as Error)
      })
  }
}
