import { SCHEDULE_EVENT } from '@shared/constants/index'
import { mainWindow } from '@main/main-window'

type ScheduleEventEnvelope = {
  type: 'schedule.updated' | 'message.created' | 'message.updated'
  payload: any
  chatId?: number
  chatUuid?: string
  sequence: number
  timestamp: number
}

let globalSequence = 0

export class ScheduleEventEmitter {
  constructor(
    private readonly meta: { chatId?: number; chatUuid?: string }
  ) {}

  emit(type: ScheduleEventEnvelope['type'], payload: any): void {
    const envelope: ScheduleEventEnvelope = {
      type,
      payload,
      chatId: this.meta.chatId,
      chatUuid: this.meta.chatUuid,
      sequence: globalSequence + 1,
      timestamp: Date.now()
    }
    globalSequence += 1

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(SCHEDULE_EVENT, envelope)
  }
}
