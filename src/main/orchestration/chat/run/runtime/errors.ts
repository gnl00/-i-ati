export { AbortError } from '@main/agent/contracts'

export class DuplicateSubmissionIdError extends Error {
  code = 'DUPLICATE_SUBMISSION_ID'

  constructor(submissionId: string) {
    super(`DUPLICATE_SUBMISSION_ID: ${submissionId}`)
    this.name = 'DuplicateSubmissionIdError'
  }
}

export class ChatRunBusyError extends Error {
  readonly code = 'CHAT_RUN_BUSY'

  constructor(readonly chatUuid: string, readonly activeSubmissionId: string) {
    super('This conversation already has an active run. Stop it or send a steering message.')
    this.name = 'ChatRunBusyError'
  }
}
