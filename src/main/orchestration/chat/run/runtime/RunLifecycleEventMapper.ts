import type { RunEventEmitter } from '../infrastructure'
import {
  RUN_LIFECYCLE_EVENTS,
  RUN_STATES,
  type SerializedError
} from '@shared/run/lifecycle-events'

export class RunLifecycleEventMapper {
  constructor(private readonly emitter: RunEventEmitter) {}

  emitAccepted(submissionId: string): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_ACCEPTED, {
      accepted: true,
      submissionId
    })
  }

  emitPreparing(): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.PREPARING
    })
  }

  emitFinalizing(): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.FINALIZING
    })
  }

  emitCompleted(assistantMessageId: number, usage?: ITokenUsage): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_COMPLETED, {
      assistantMessageId,
      usage
    })
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.COMPLETED
    })
  }

  emitAborted(): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_ABORTED, { reason: 'cancelled' })
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.ABORTED
    })
  }

  emitFailed(error: SerializedError): void {
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_FAILED, { error })
    this.emitter.emit(RUN_LIFECYCLE_EVENTS.RUN_STATE_CHANGED, {
      state: RUN_STATES.FAILED
    })
  }
}
