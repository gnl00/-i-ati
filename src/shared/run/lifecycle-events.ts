export const RUN_STATES = {
  PREPARING: 'preparing',
  STREAMING: 'streaming',
  EXECUTING_TOOLS: 'executing_tools',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ABORTED: 'aborted'
} as const

export type RunState = typeof RUN_STATES[keyof typeof RUN_STATES]

export type SerializedError = {
  name: string
  message: string
  stack?: string
  code?: string
  cause?: SerializedError
}

export const RUN_LIFECYCLE_EVENTS = {
  RUN_ACCEPTED: 'run.accepted',
  RUN_STATE_CHANGED: 'run.state.changed',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_ABORTED: 'run.aborted'
} as const

export type RunLifecycleEventPayloads = {
  'run.accepted': { accepted: true; submissionId: string }
  'run.state.changed': { state: RunState }
  'run.completed': { assistantMessageId: number; usage?: ITokenUsage }
  'run.failed': { error: SerializedError | Error }
  'run.aborted': { reason?: string }
}

