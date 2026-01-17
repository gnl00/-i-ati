import type {
  ChatSubmitEventEnvelope,
  ChatSubmitEventMeta,
  ChatSubmitEventPayloads,
  ChatSubmitEventType
} from './events'
import type { EventPublisher, EventPublisherHandler } from './event-publisher'

export class ChatSubmitEventBus implements EventPublisher {
  private handlers = new Map<ChatSubmitEventType, Set<EventPublisherHandler<any>>>()
  private queue: Promise<void> = Promise.resolve()
  private closed = false
  private sequence = 0

  on<T extends ChatSubmitEventType>(
    type: T,
    handler: EventPublisherHandler<T>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler as EventPublisherHandler<any>)
    return () => {
      this.handlers.get(type)?.delete(handler as EventPublisherHandler<any>)
    }
  }

  emit<T extends ChatSubmitEventType>(
    type: T,
    payload: ChatSubmitEventPayloads[T],
    meta: ChatSubmitEventMeta
  ): Promise<void> {
    if (this.closed) {
      return Promise.resolve()
    }

    const envelope: ChatSubmitEventEnvelope<T> = {
      ...meta,
      type,
      payload,
      timestamp: Date.now(),
      sequence: this.sequence + 1
    }
    this.sequence += 1

    this.queue = this.queue.then(async () => {
      if (this.closed) {
        return
      }
      const handlers = this.handlers.get(type)
      if (!handlers || handlers.size === 0) {
        return
      }
      for (const handler of handlers) {
        await handler(payload, envelope)
      }
    })

    return this.queue
  }

  clear(): void {
    this.handlers.clear()
  }

  clearEvent(type: ChatSubmitEventType): void {
    this.handlers.delete(type)
  }

  close(): void {
    this.closed = true
    this.handlers.clear()
  }
}
