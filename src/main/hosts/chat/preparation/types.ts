import type { RunModelContext, RunSpec } from '@main/agent/contracts'

export type HostRunInputState = {
  textCtx: string
  textAttachments?: TextAttachment[]
  mediaCtx: ClipbordImg[] | string[]
  source?: string
  host?: ChatMessageHostMeta
  tools?: any[]
  userInstruction?: string
  options?: IUnifiedRequest['options']
  stream?: boolean
  chatUserInstruction?: string
  permissionApprovalMode?: PermissionApprovalMode
  nativeNotification?: {
    notifyOnFailure: boolean
    occurrenceKey?: string
  }
}

export type MainAgentRunInput = {
  submissionId: string
  input: HostRunInputState
  modelRef: ModelRef
  chatModelRef?: ModelRef
  chatId?: number
  chatUuid?: string
}

export type RunPreparationOptions = {
  modelContext?: RunModelContext
  systemPrompt?: string
  options?: IUnifiedRequest['options']
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
  earlyEmittedMessageIds: number[]
}

export type ChatHostRunContext = {
  emotionEnabled?: boolean
  chat: ChatEntity
  workspacePath: string
  historyMessages: MessageEntity[]
  createdMessages: MessageEntity[]
  earlyEmittedMessageIds: number[]
  messageEntities: MessageEntity[]
  assistantDraft: MessageEntity
}

export type RunPreparationResult = {
  runSpec: RunSpec
  chatContext: ChatHostRunContext
}
