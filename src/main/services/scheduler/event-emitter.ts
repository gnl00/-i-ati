import { SCHEDULE_EVENT } from '@shared/constants/index'
import { mainWindow } from '@main/main-window'
import type {
  ScheduleEventEnvelope,
  ScheduleEventPayloads,
  ScheduleEventType
} from '@shared/schedule/events'

let globalSequence = 0

export class ScheduleEventEmitter {
  constructor(
    private readonly meta: { chatId?: number; chatUuid?: string }
  ) {}

  emit<T extends ScheduleEventType>(type: T, payload: ScheduleEventPayloads[T]): void {
    const envelope: ScheduleEventEnvelope<T> = {
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
