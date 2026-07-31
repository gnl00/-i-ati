import {
  RUN_STEERING_LIMITS,
  type RunSteerRequest,
  type RunSteerResult
} from '@shared/run/steering-events'

type RunSteerRejectionReason = Extract<
  RunSteerResult['reason'],
  'invalid_request' | 'payload_too_large'
>

export type RunSteerValidationResult =
  | { valid: true; request: RunSteerRequest; payloadBytes: number }
  | { valid: false; reason: RunSteerRejectionReason }

const encoder = new TextEncoder()

const byteLength = (value: string): number => encoder.encode(value).byteLength
const DATA_IMAGE_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+={0,2}$/i

const isValidIdentifier = (value: unknown): value is string => (
  typeof value === 'string'
  && value.trim().length > 0
  && value.length <= RUN_STEERING_LIMITS.maxIdentifierChars
)

export function validateRunSteerRequest(input: unknown): RunSteerValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, reason: 'invalid_request' }
  }

  const candidate = input as Record<string, unknown>
  if (
    !isValidIdentifier(candidate.submissionId)
    || !isValidIdentifier(candidate.chatUuid)
    || !isValidIdentifier(candidate.queueItemId)
    || typeof candidate.text !== 'string'
    || !Array.isArray(candidate.images)
  ) {
    return { valid: false, reason: 'invalid_request' }
  }

  if (
    candidate.text.length > RUN_STEERING_LIMITS.maxTextChars
    || candidate.images.length > RUN_STEERING_LIMITS.maxImagesPerItem
  ) {
    return { valid: false, reason: 'payload_too_large' }
  }

  let payloadBytes = byteLength(candidate.text)
  let hasImageContent = false
  for (const image of candidate.images) {
    let imageBytes = 0
    if (typeof image === 'string') {
      if (!DATA_IMAGE_URL_PATTERN.test(image)) {
        return { valid: false, reason: 'invalid_request' }
      }
      if (image.length > RUN_STEERING_LIMITS.maxImageBytes) {
        return { valid: false, reason: 'payload_too_large' }
      }
      imageBytes = byteLength(image)
      hasImageContent ||= image.length > 0
    } else if (image !== null) {
      return { valid: false, reason: 'invalid_request' }
    }

    if (imageBytes > RUN_STEERING_LIMITS.maxImageBytes) {
      return { valid: false, reason: 'payload_too_large' }
    }
    payloadBytes += imageBytes
  }

  if (candidate.text.trim().length === 0 && !hasImageContent) {
    return { valid: false, reason: 'invalid_request' }
  }
  if (payloadBytes > RUN_STEERING_LIMITS.maxItemBytes) {
    return { valid: false, reason: 'payload_too_large' }
  }

  return {
    valid: true,
    request: candidate as RunSteerRequest,
    payloadBytes
  }
}
