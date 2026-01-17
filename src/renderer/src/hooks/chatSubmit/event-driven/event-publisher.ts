import type {
  ChatSubmitEventEnvelope,
  ChatSubmitEventMeta,
  ChatSubmitEventPayloads,
  ChatSubmitEventType
} from './events'

export type EventPublisherHandler<T extends ChatSubmitEventType> = (
  payload: ChatSubmitEventPayloads[T],
  envelope: ChatSubmitEventEnvelope<T>
) => void | Promise<void>

export interface EventPublisher {
  emit<T extends ChatSubmitEventType>(
    type: T,
    payload: ChatSubmitEventPayloads[T],
    meta: ChatSubmitEventMeta
  ): Promise<void>
}
