import type { ChatRunEventEmitter } from '../infrastructure'
import {
  CHAT_RUN_EVENTS,
  CHAT_RUN_STATES,
  type SerializedError
} from '@shared/chatRun/events'

export class RunLifecycleEventMapper {
  constructor(private readonly emitter: ChatRunEventEmitter) {}

  emitAccepted(submissionId: string): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId
    })
  }

  emitPreparing(): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.PREPARING
    })
  }

  emitFinalizing(): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.FINALIZING
    })
  }

  emitCompleted(assistantMessageId: number, usage?: ITokenUsage): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_COMPLETED, {
      assistantMessageId,
      usage
    })
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.COMPLETED
    })
  }

  emitAborted(): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_ABORTED, { reason: 'cancelled' })
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.ABORTED
    })
  }

  emitFailed(error: SerializedError): void {
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_FAILED, { error })
    this.emitter.emit(CHAT_RUN_EVENTS.RUN_STATE_CHANGED, {
      state: CHAT_RUN_STATES.FAILED
    })
  }
}
