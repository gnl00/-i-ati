import { mainWindow } from '@main/main-window'
import { CONFIG_EVENT } from '@shared/constants'
import { CONFIG_EVENTS, type ConfigEventEnvelope, type ConfigEventPayloads, type ConfigEventType } from '@shared/config/events'

let globalSequence = 0

export class ConfigEventEmitter {
  emit<T extends ConfigEventType>(type: T, payload: ConfigEventPayloads[T]): void {
    const envelope: ConfigEventEnvelope<T> = {
      type,
      payload,
      sequence: globalSequence + 1,
      timestamp: Date.now()
    }
    globalSequence += 1

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(CONFIG_EVENT, envelope)
  }

  emitUpdated(source?: string): void {
    this.emit(CONFIG_EVENTS.UPDATED, { source })
  }
}

export const configEventEmitter = new ConfigEventEmitter()
