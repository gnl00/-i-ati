import { mainWindow } from '@main/main-window'
import { PLUGIN_EVENT } from '@shared/constants'
import { PLUGIN_EVENTS, type PluginEventEnvelope, type PluginEventPayloads, type PluginEventType } from '@shared/plugins/events'

let globalSequence = 0

export class PluginEventEmitter {
  emit<T extends PluginEventType>(type: T, payload: PluginEventPayloads[T]): void {
    const envelope: PluginEventEnvelope<T> = {
      type,
      payload,
      sequence: globalSequence + 1,
      timestamp: Date.now()
    }
    globalSequence += 1

    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }

    mainWindow.webContents.send(PLUGIN_EVENT, envelope)
  }

  emitPluginsUpdated(plugins: PluginEntity[]): void {
    this.emit(PLUGIN_EVENTS.UPDATED, { plugins })
  }
}

export const pluginEventEmitter = new PluginEventEmitter()
