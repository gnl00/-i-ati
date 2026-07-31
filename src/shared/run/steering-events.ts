export const RUN_STEERING_EVENTS = {
  STEERING_CONSUMED: 'run.steering.consumed',
  STEERING_RETURNED: 'run.steering.returned'
} as const

export type RunSteeringEventPayloads = {
  'run.steering.consumed': {
    queueItemId: string
  }
  'run.steering.returned': {
    queueItemIds: string[]
  }
}

export type RunSteerRequest = {
  submissionId: string
  chatUuid: string
  queueItemId: string
  text: string
  images: ClipbordImg[]
}

export type RunSteerResult = {
  accepted: boolean
  reason?: 'run_not_found' | 'chat_mismatch' | 'run_finished'
}
