export const RUN_STEERING_EVENTS = {
  STEERING_CONSUMED: 'run.steering.consumed',
  STEERING_RETURNED: 'run.steering.returned'
} as const

export const RUN_STEERING_LIMITS = {
  maxPendingItems: 5,
  maxRecentAcknowledgedIds: 100,
  maxIdentifierChars: 256,
  maxTextChars: 256 * 1024,
  maxImagesPerItem: 16,
  maxImageBytes: 32 * 1024 * 1024,
  maxItemBytes: 48 * 1024 * 1024,
  maxPendingBytes: 64 * 1024 * 1024
} as const

const steeringPayloadTextEncoder = new TextEncoder()

export type RunSteerImage = string | null

export function measureRunSteerPayloadBytes(
  input: Pick<RunSteerRequest, 'text' | 'images'>
): number {
  let payloadBytes = steeringPayloadTextEncoder.encode(input.text).byteLength
  for (const image of input.images) {
    if (typeof image === 'string') {
      payloadBytes += steeringPayloadTextEncoder.encode(image).byteLength
    }
  }
  return payloadBytes
}

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
  images: RunSteerImage[]
}

export type RunSteerResult = {
  accepted: boolean
  reason?:
    | 'run_not_found'
    | 'chat_mismatch'
    | 'run_finished'
    | 'invalid_request'
    | 'payload_too_large'
    | 'queue_full'
}
