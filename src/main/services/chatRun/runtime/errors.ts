export { AbortError } from '@main/services/agent/contracts'

export class DuplicateSubmissionIdError extends Error {
  code = 'DUPLICATE_SUBMISSION_ID'

  constructor(submissionId: string) {
    super(`DUPLICATE_SUBMISSION_ID: ${submissionId}`)
    this.name = 'DuplicateSubmissionIdError'
  }
}
