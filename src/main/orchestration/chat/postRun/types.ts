import type { RunModelContext } from '@main/agent/contracts'

export type PostRunJobInput = {
  submissionId: string
  chatEntity: ChatEntity
  messageBuffer: MessageEntity[]
  content: string
  modelContext: RunModelContext
}
