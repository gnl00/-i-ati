import {
  RUN_LIFECYCLE_EVENTS,
  RUN_STATES,
  type RunLifecycleEventPayloads,
  type RunState,
  type SerializedError
} from './lifecycle-events'
import {
  RUN_OUTPUT_EVENTS,
  type MessageSegmentPatch,
  type RunOutputEventPayloads,
  type RunToolCall
} from './output-events'
import {
  RUN_MAINTENANCE_EVENTS,
  type PostRunPlan,
  type RunMaintenanceEventPayloads
} from './maintenance-events'
import {
  CHAT_HOST_EVENTS,
  type ChatHostEventPayloads
} from '../chat/host-events'

export {
  RUN_STATES,
  RUN_LIFECYCLE_EVENTS,
  RUN_OUTPUT_EVENTS,
  RUN_MAINTENANCE_EVENTS
}

export type {
  RunState,
  SerializedError,
  RunToolCall,
  MessageSegmentPatch,
  PostRunPlan,
  RunLifecycleEventPayloads,
  RunOutputEventPayloads,
  RunMaintenanceEventPayloads
}

export const RUN_EVENTS = {
  ...RUN_LIFECYCLE_EVENTS,
  ...RUN_OUTPUT_EVENTS,
  ...RUN_MAINTENANCE_EVENTS
} as const

export type RunCoreEventPayloads =
  & RunLifecycleEventPayloads
  & RunOutputEventPayloads
  & RunMaintenanceEventPayloads

export type RunEventPayloads =
  & RunCoreEventPayloads
  & ChatHostEventPayloads

export type RunCoreEventType = keyof RunCoreEventPayloads
export type RunEventType = keyof RunEventPayloads

export { CHAT_HOST_EVENTS }
export type { ChatHostEventPayloads }

export type RunEventMeta = {
  submissionId: string
  chatId?: number
  chatUuid?: string
  cycle?: number
}

export type RunEventEnvelope<T extends RunEventType = RunEventType> =
  RunEventMeta & {
    type: T
    payload: RunEventPayloads[T]
    timestamp: number
    sequence: number
  }

export type RunEvent =
  { [K in RunEventType]: RunEventEnvelope<K> }[RunEventType]
