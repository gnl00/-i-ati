import type { ChatRunModelContext } from '@main/services/agent/contracts'

export type PostRunJobInput = {
  submissionId: string
  chatEntity: ChatEntity
  messageBuffer: MessageEntity[]
  content: string
  modelContext: ChatRunModelContext
}
