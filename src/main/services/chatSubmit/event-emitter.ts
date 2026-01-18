import { CHAT_SUBMIT_EVENT } from '@shared/constants'
import { mainWindow } from '@main/main-window'

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

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(CHAT_SUBMIT_EVENT, envelope)
  }
}
