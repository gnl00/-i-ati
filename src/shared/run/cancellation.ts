export type ActiveChatRunIdentity = {
  submissionId: string
  chatUuid: string
}

export type RunCancelRequest = {
  submissionId?: string
  chatUuid?: string
  reason?: string
}

export type RunCancelResult = {
  cancelled: boolean
  submissionId?: string
  reason?: 'run_not_found' | 'chat_mismatch' | 'invalid_request'
}
