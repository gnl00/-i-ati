import type { RunModelContext, RunSpec } from '@main/agent/contracts'

export type HostRunInputState = {
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  source?: string
  host?: ChatMessageHostMeta
  tools?: any[]
  userInstruction?: string
  options?: IUnifiedRequest['options']
  stream?: boolean
  chatUserInstruction?: string
}

export type MainAgentRunInput = {
  submissionId: string
  input: HostRunInputState
  modelRef: ModelRef
  chatId?: number
  chatUuid?: string
}

export type RunEnvironment = {
  chat: ChatEntity
  modelContext: RunModelContext
  workspacePath: string
  historyMessages: MessageEntity[]
}

export type StepBootstrap = {
  messageBuffer: MessageEntity[]
  assistantDraft: MessageEntity
}

export type ChatHostRunContext = {
  chat: ChatEntity
  workspacePath: string
  historyMessages: MessageEntity[]
  createdMessages: MessageEntity[]
  messageEntities: MessageEntity[]
  assistantDraft: MessageEntity
}

export type RunPreparationResult = {
  runSpec: RunSpec
  chatContext: ChatHostRunContext
}
