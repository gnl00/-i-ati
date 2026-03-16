import type { ChatRunModelContext } from '@main/services/agentCore/types'

export type PostRunJobInput = {
  submissionId: string
  chatEntity: ChatEntity
  messageBuffer: MessageEntity[]
  content: string
  modelContext: ChatRunModelContext
}
