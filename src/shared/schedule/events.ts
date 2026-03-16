export const SCHEDULE_EVENTS = {
  UPDATED: 'schedule.updated',
  MESSAGE_CREATED: 'message.created',
  MESSAGE_UPDATED: 'message.updated'
} as const

export type ScheduleEventType = typeof SCHEDULE_EVENTS[keyof typeof SCHEDULE_EVENTS]

export type ScheduleEventPayloads = {
  [SCHEDULE_EVENTS.UPDATED]: { task: import('@shared/tools/schedule').ScheduleTask }
  [SCHEDULE_EVENTS.MESSAGE_CREATED]: { message: MessageEntity }
  [SCHEDULE_EVENTS.MESSAGE_UPDATED]: { message: MessageEntity }
}

export type ScheduleEventEnvelope<T extends ScheduleEventType = ScheduleEventType> = {
  type: T
  payload: ScheduleEventPayloads[T]
  chatId?: number
  chatUuid?: string
  sequence: number
  timestamp: number
}

export type ScheduleEvent =
  { [K in ScheduleEventType]: ScheduleEventEnvelope<K> }[ScheduleEventType]
