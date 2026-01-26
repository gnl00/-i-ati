import { CHAT_SUBMIT_EVENT } from '@shared/constants'
import { mainWindow } from '@main/main-window'
import DatabaseService from '@main/services/DatabaseService'

export type ChatSubmitEventEnvelope = {
  type: string
  payload: any
  submissionId: string
  chatId?: number
  chatUuid?: string
  sequence: number
  timestamp: number
}

export class ChatSubmitEventEmitter {
  private sequence = 0

  constructor(
    private readonly meta: { submissionId: string; chatId?: number; chatUuid?: string }
  ) {}

  emit(type: string, payload: any): void {
    const envelope: ChatSubmitEventEnvelope = {
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
      DatabaseService.saveChatSubmitEvent({
        submissionId: envelope.submissionId,
        chatId: envelope.chatId,
        chatUuid: envelope.chatUuid,
        sequence: envelope.sequence,
        type: envelope.type,
        timestamp: envelope.timestamp,
        payload: envelope.payload
      })
    } catch (error) {
      // Do not block emission on persistence failures.
      console.warn('[ChatSubmitEventEmitter] Failed to save trace event', error)
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(CHAT_SUBMIT_EVENT, envelope)
  }
}
