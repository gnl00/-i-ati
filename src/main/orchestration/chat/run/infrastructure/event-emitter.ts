import { RUN_EVENT } from '@shared/constants/index'
import { mainWindow } from '@main/main-window'
import DatabaseService from '@main/db/DatabaseService'
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

export class RunEventEmitter {
  private sequence = 0

  constructor(
    private readonly meta: RunEventMeta,
    private readonly sinks: RunEventSink[] = []
  ) {}

  setChatMeta(chat: { chatId?: number; chatUuid?: string }): void {
    this.meta.chatId = chat.chatId
    this.meta.chatUuid = chat.chatUuid
  }

  emit<T extends RunEventType>(type: T, payload: RunEventPayloads[T]): void {
    const envelope: RunEventEnvelope<T> = {
      type,
      payload,
      submissionId: this.meta.submissionId,
      chatId: this.meta.chatId,
      chatUuid: this.meta.chatUuid,
      sequence: this.sequence + 1,
      timestamp: Date.now()
    }
    this.sequence += 1

    try {
      DatabaseService.saveRunEvent({
        submissionId: envelope.submissionId,
        chatId: envelope.chatId,
        chatUuid: envelope.chatUuid,
        sequence: envelope.sequence,
        type: envelope.type,
        timestamp: envelope.timestamp,
        payload: envelope.payload
      })
    } catch (error) {
      console.warn('[RunEventEmitter] Failed to save trace event', error)
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      this.dispatchToSinks(envelope)
      return
    }

    mainWindow.webContents.send(RUN_EVENT, envelope)
    this.dispatchToSinks(envelope)
  }

  private dispatchToSinks(envelope: RunEventEnvelope): void {
    for (const sink of this.sinks) {
      try {
        const result = sink.handleEvent(envelope)
        if (result && typeof result.then === 'function') {
          void result.catch((error) => {
            console.warn('[RunEventEmitter] Sink failed to handle event', error)
          })
        }
      } catch (error) {
        console.warn('[RunEventEmitter] Sink failed to handle event', error)
      }
    }
  }
}

export class RunEventEmitterFactory {
  create(meta: RunEventMeta, sinks: RunEventSink[] = []): RunEventEmitter {
    return new RunEventEmitter(meta, sinks)
  }

  createOptional(
    meta: Partial<RunEventMeta> & { submissionId?: string },
    sinks: RunEventSink[] = []
  ): RunEventEmitter | null {
    if (!meta.submissionId) {
      return null
    }

    return this.create({
      submissionId: meta.submissionId,
      chatId: meta.chatId,
      chatUuid: meta.chatUuid
    }, sinks)
  }
}
