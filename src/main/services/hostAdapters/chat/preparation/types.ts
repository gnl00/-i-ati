import type { ChatRunModelContext, RunSpec } from '@main/services/agentCore/types'

export type ChatRunInputState = {
  textCtx: string
  mediaCtx: ClipbordImg[] | string[]
  source?: string
  tools?: any[]
  userInstruction?: string
  options?: IUnifiedRequest['options']
  stream?: boolean
  chatUserInstruction?: string
}

export type MainChatRunInput = {
  submissionId: string
  input: ChatRunInputState
  modelRef: ModelRef
  chatId?: number
  chatUuid?: string
}

export type RunEnvironment = {
  chat: ChatEntity
  modelContext: ChatRunModelContext
  workspacePath: string
  historyMessages: MessageEntity[]
}

export type StepBootstrap = {
  messageBuffer: MessageEntity[]
  assistantPlaceholder: MessageEntity
}

export type ChatRunContext = {
  chat: ChatEntity
  workspacePath: string
  historyMessages: MessageEntity[]
  createdMessages: MessageEntity[]
  messageEntities: MessageEntity[]
  assistantPlaceholder: MessageEntity
}

export type RunPreparationResult = {
  runSpec: RunSpec
  chatContext: ChatRunContext
}
