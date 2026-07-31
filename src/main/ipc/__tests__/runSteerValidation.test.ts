import { describe, expect, it } from 'vitest'
import { RUN_STEERING_LIMITS } from '@shared/run/steering-events'
import { validateRunSteerRequest } from '../runSteerValidation'

const request = (overrides: Record<string, unknown> = {}) => ({
  submissionId: 'submission-1',
  chatUuid: 'chat-1',
  queueItemId: 'queue-1',
  text: 'guide the current run',
  images: [],
  ...overrides
})

describe('validateRunSteerRequest', () => {
  it('accepts string images and null clipboard placeholders', () => {
    expect(validateRunSteerRequest(request({
      text: '',
      images: ['data:image/png;base64,abc', null]
    }))).toEqual({
      valid: true,
      request: request({
        text: '',
        images: ['data:image/png;base64,abc', null]
      }),
      payloadBytes: 25
    })
  })

  it.each([
    null,
    request({ text: null }),
    request({ images: null }),
    request({ images: [{}] }),
    request({ images: [new ArrayBuffer(4)] }),
    request({ images: [{ [Symbol.toStringTag]: 'ArrayBuffer', byteLength: -Infinity }] }),
    request({ images: ['https://example.com/image.png'] }),
    request({ images: ['file:///tmp/image.png'] }),
    request({ images: ['data:text/plain;base64,abc'] }),
    request({ submissionId: '' }),
    request({ chatUuid: ' ' }),
    request({ queueItemId: '' }),
    request({ text: ' ', images: [null, ''] })
  ])('rejects malformed payload %#', (payload) => {
    expect(validateRunSteerRequest(payload)).toEqual({
      valid: false,
      reason: 'invalid_request'
    })
  })

  it.each([
    request({ text: 'a'.repeat(RUN_STEERING_LIMITS.maxTextChars + 1) }),
    request({ images: Array.from(
      { length: RUN_STEERING_LIMITS.maxImagesPerItem + 1 },
      () => null
    ) })
  ])('rejects payload limits before queueing %#', (payload) => {
    expect(validateRunSteerRequest(payload)).toEqual({
      valid: false,
      reason: 'payload_too_large'
    })
  })
})
