import { describe, expect, it } from 'vitest'
import { DuplicateSubmissionIdError } from '../errors'

describe('DuplicateSubmissionIdError', () => {
  it('exposes stable code and message for renderer handling', () => {
    const error = new DuplicateSubmissionIdError('submission-1')
    expect(error.name).toBe('DuplicateSubmissionIdError')
    expect(error.code).toBe('DUPLICATE_SUBMISSION_ID')
    expect(error.message).toBe('DUPLICATE_SUBMISSION_ID: submission-1')
  })
})
