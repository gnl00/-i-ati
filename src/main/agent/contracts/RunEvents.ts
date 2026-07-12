import type {
  RunEventEnvelope,
  RunEventPayloads,
  RunEventType
} from '@shared/run/events'

export type RunEventMeta = {
  submissionId: string
  chatId?: number
  chatUuid?: string
}

export interface RunEventSink {
  handleEvent(event: RunEventEnvelope): void | Promise<void>
}

export interface RunEventEmitter {
  readonly submissionId: string
  setChatMeta(chat: { chatId?: number; chatUuid?: string }): void
  emit<T extends RunEventType>(type: T, payload: RunEventPayloads[T]): void
}
