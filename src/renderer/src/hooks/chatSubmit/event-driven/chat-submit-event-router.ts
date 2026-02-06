import type { ChatSubmitEventType } from './events'

const lifecycleEventTypes = new Set<ChatSubmitEventType>([
  'request.built',
  'request.sent',
  'stream.started',
  'stream.completed',
  'submission.aborted',
  'submission.failed',
  'submission.completed'
])

const streamEventTypes = new Set<ChatSubmitEventType>([
  'stream.chunk'
])

const toolEventTypes = new Set<ChatSubmitEventType>([
  'tool.call.detected',
  'tool.call.flushed',
  'tool.call.attached',
  'tool.exec.started',
  'tool.exec.requires_confirmation',
  'tool.exec.completed',
  'tool.exec.failed',
  'tool.result.attached',
  'tool.result.persisted'
])

export function isLifecycleEventType(type: ChatSubmitEventType): boolean {
  return lifecycleEventTypes.has(type)
}

export function isStreamEventType(type: ChatSubmitEventType): boolean {
  return streamEventTypes.has(type)
}

export function isToolEventType(type: ChatSubmitEventType): boolean {
  return toolEventTypes.has(type)
}
