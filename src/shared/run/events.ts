import {
  RUN_LIFECYCLE_EVENTS,
  RUN_STATES,
  type RunLifecycleEventPayloads,
  type RunState,
  type SerializedError
} from './lifecycle-events'
import {
  RUN_TOOL_EVENTS,
  type RunToolEventPayloads,
  type RunToolCall
} from './tool-events'
import {
  RUN_MAINTENANCE_EVENTS,
  type PostRunPlan,
  type RunMaintenanceEventPayloads
} from './maintenance-events'
import {
  SUBAGENT_EVENTS,
  type SubagentEventPayloads
} from '../subagent/events'
import {
  CHAT_HOST_EVENTS,
  type ChatHostEventPayloads
} from '../chat/host-events'
import {
  CHAT_RENDER_EVENTS,
  type ChatRenderEventPayloads,
  type MessageSegmentPatch
} from '../chat/render-events'

export {
  RUN_STATES,
  RUN_LIFECYCLE_EVENTS,
  RUN_TOOL_EVENTS,
  RUN_MAINTENANCE_EVENTS,
  CHAT_RENDER_EVENTS,
  SUBAGENT_EVENTS
}

export type {
  RunState,
  SerializedError,
  RunToolCall,
  MessageSegmentPatch,
  PostRunPlan,
  RunLifecycleEventPayloads,
  RunToolEventPayloads,
  RunMaintenanceEventPayloads
}

// Aggregate registry for transport compatibility only.
// Domain code should prefer importing concrete families directly:
// - chat render consumers -> CHAT_RENDER_EVENTS
// - tool consumers -> RUN_TOOL_EVENTS
// - lifecycle / maintenance consumers -> their respective event families
// - subagent consumers -> SUBAGENT_EVENTS
// Keep new business events owned by a concrete family first, then aggregate here.
export const RUN_EVENTS = {
  ...RUN_LIFECYCLE_EVENTS,
  ...RUN_TOOL_EVENTS,
  ...RUN_MAINTENANCE_EVENTS,
  ...CHAT_RENDER_EVENTS,
  ...SUBAGENT_EVENTS
} as const

export type RunCoreEventPayloads =
  & RunLifecycleEventPayloads
  & RunToolEventPayloads
  & RunMaintenanceEventPayloads

export type RunEventPayloads =
  & RunCoreEventPayloads
  & ChatRenderEventPayloads
  & ChatHostEventPayloads
  & SubagentEventPayloads

export type RunCoreEventType = keyof RunCoreEventPayloads
export type RunEventType = keyof RunEventPayloads

export { CHAT_HOST_EVENTS }
export type {
  ChatHostEventPayloads,
  ChatRenderEventPayloads,
  SubagentEventPayloads
}

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
