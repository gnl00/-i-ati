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

export class ChatRunEventEmitter {
  private sequence = 0

  constructor(private readonly meta: ChatRunEventMeta) {}

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
      return
    }

    mainWindow.webContents.send(CHAT_RUN_EVENT, envelope)
  }
}

export class ChatRunEventEmitterFactory {
  create(meta: ChatRunEventMeta): ChatRunEventEmitter {
    return new ChatRunEventEmitter(meta)
  }

  createOptional(meta: Partial<ChatRunEventMeta> & { submissionId?: string }): ChatRunEventEmitter | null {
    if (!meta.submissionId) {
      return null
    }

    return this.create({
      submissionId: meta.submissionId,
      chatId: meta.chatId,
      chatUuid: meta.chatUuid
    })
  }
}
