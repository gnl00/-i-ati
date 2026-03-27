import { CHAT_RUN_EVENT } from '@shared/constants/index'
import { mainWindow } from '@main/main-window'
import DatabaseService from '@main/services/DatabaseService'
import type {
  ChatRunEventEnvelope,
  ChatRunEventPayloads,
  ChatRunEventType
} from '@shared/chatRun/events'

export type ChatRunEventMeta = {
  submissionId: string
  chatId?: number
  chatUuid?: string
}

export interface ChatRunEventSink {
  handleEvent(event: ChatRunEventEnvelope): void | Promise<void>
}

export class ChatRunEventEmitter {
  private sequence = 0

  constructor(
    private readonly meta: ChatRunEventMeta,
    private readonly sinks: ChatRunEventSink[] = []
  ) {}

  setChatMeta(chat: { chatId?: number; chatUuid?: string }): void {
    this.meta.chatId = chat.chatId
    this.meta.chatUuid = chat.chatUuid
  }

  emit<T extends ChatRunEventType>(type: T, payload: ChatRunEventPayloads[T]): void {
    const envelope: ChatRunEventEnvelope<T> = {
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
      DatabaseService.saveChatRunEvent({
        submissionId: envelope.submissionId,
        chatId: envelope.chatId,
        chatUuid: envelope.chatUuid,
        sequence: envelope.sequence,
        type: envelope.type,
        timestamp: envelope.timestamp,
        payload: envelope.payload
      })
    } catch (error) {
      console.warn('[ChatRunEventEmitter] Failed to save trace event', error)
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      this.dispatchToSinks(envelope)
      return
    }

    mainWindow.webContents.send(CHAT_RUN_EVENT, envelope)
    this.dispatchToSinks(envelope)
  }

  private dispatchToSinks(envelope: ChatRunEventEnvelope): void {
    for (const sink of this.sinks) {
      try {
        const result = sink.handleEvent(envelope)
        if (result && typeof result.then === 'function') {
          void result.catch((error) => {
            console.warn('[ChatRunEventEmitter] Sink failed to handle event', error)
          })
        }
      } catch (error) {
        console.warn('[ChatRunEventEmitter] Sink failed to handle event', error)
      }
    }
  }
}

export class ChatRunEventEmitterFactory {
  create(meta: ChatRunEventMeta, sinks: ChatRunEventSink[] = []): ChatRunEventEmitter {
    return new ChatRunEventEmitter(meta, sinks)
  }

  createOptional(
    meta: Partial<ChatRunEventMeta> & { submissionId?: string },
    sinks: ChatRunEventSink[] = []
  ): ChatRunEventEmitter | null {
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
