import {
  HostOutputDispatcher,
  type HostOutputAdapter
} from '@main/hosts/shared/output/HostOutputDispatcher'
import { RUN_EVENT } from '@shared/constants/index'
import { mainWindow } from '@main/main-window'
import { runEventDb } from '@main/db/run-events'
import type {
  RunEventEmitter as RunEventEmitterContract,
  RunEventMeta,
  RunEventSink
} from '@main/agent/contracts'
import type { RunEventEnvelope, RunEventPayloads, RunEventType } from '@shared/run/events'
import { CHAT_HOST_EVENTS } from '@shared/chat/host-events'
import { CHAT_RENDER_EVENTS } from '@shared/chat/render-events'
import { RUN_TOOL_EVENTS } from '@shared/run/tool-events'

const TRANSPORT_ONLY_RUN_EVENTS = new Set<RunEventType>([
  ...Object.values(CHAT_RENDER_EVENTS),
  CHAT_HOST_EVENTS.MESSAGES_LOADED,
  RUN_TOOL_EVENTS.TOOL_EXECUTION_OUTPUT
])

export class RunEventEmitter implements RunEventEmitterContract {
  private sequence = 0
  private readonly adapters: HostOutputAdapter[]

  constructor(
    private readonly meta: RunEventMeta,
    sinks: RunEventSink[] = [],
    private readonly dispatcher = new HostOutputDispatcher()
  ) {
    this.adapters = [
      {
        name: 'Chat IPC adapter',
        accepts: (output): boolean => output.kind === 'run',
        deliver: (output): void | Promise<void> => {
          if (output.kind === 'run' && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(RUN_EVENT, output.event)
          }
        }
      },
      ...sinks.map(
        (sink) =>
          ({
            name: sink.constructor.name,
            accepts: (output): boolean => output.kind === 'run',
            deliver: (output): void | Promise<void> => {
              if (output.kind === 'run') return sink.handleEvent(output.event)
            }
          }) satisfies HostOutputAdapter
      )
    ]
  }

  get submissionId(): string {
    return this.meta.submissionId
  }

  get chatUuid(): string | undefined {
    return this.meta.chatUuid
  }

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

    if (!TRANSPORT_ONLY_RUN_EVENTS.has(type)) {
      try {
        runEventDb.saveRunEvent({
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
    }

    void this.dispatcher.dispatch({ kind: 'run', event: envelope }, this.adapters)
  }
}

export class RunEventEmitterFactory {
  constructor(private readonly dispatcher = new HostOutputDispatcher()) {}
  create(meta: RunEventMeta, sinks: RunEventSink[] = []): RunEventEmitter {
    return new RunEventEmitter(meta, sinks, this.dispatcher)
  }

  createOptional(
    meta: Partial<RunEventMeta> & { submissionId?: string },
    sinks: RunEventSink[] = []
  ): RunEventEmitter | null {
    if (!meta.submissionId) {
      return null
    }

    return this.create(
      {
        submissionId: meta.submissionId,
        chatId: meta.chatId,
        chatUuid: meta.chatUuid
      },
      sinks
    )
  }
}
