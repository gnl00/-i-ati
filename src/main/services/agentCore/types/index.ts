import type { SerializedError } from '@shared/chatRun/events'

export type ToolCallStatus = 'pending' | 'executing' | 'success' | 'failed' | 'aborted'

export interface ToolCall {
  id: string
  name: string
  args: string
  status: ToolCallStatus
  result?: any
  error?: string
  cost?: number
  index?: number
}

export interface ToolCallProps {
  id?: string
  index?: number
  function: string
  args: string
}

export type RunModelContext = {
  model: AccountModel
  account: ProviderAccount
  providerDefinition: ProviderDefinition
}

export type ChatRunModelContext = RunModelContext

export type StepArtifact =
  | {
      kind: 'assistant_message_updated'
      messageId?: number
      role: 'assistant'
      content: string
      segments: MessageSegment[]
      toolCalls?: IToolCall[]
    }
  | {
      kind: 'tool_result_created'
      toolCallId: string
      messageId?: number
      message: ChatMessage
    }

export type RunSpec = {
  submissionId: string
  modelContext: RunModelContext
  request: IUnifiedRequest
  initialMessages: ChatMessage[]
  runtimeContext: {
    chatId?: number
    chatUuid?: string
    workspacePath?: string
  }
}

export type StepResult = {
  usage?: ITokenUsage
  completed: boolean
  finishReason?: string
  messages: ChatMessage[]
  artifacts: StepArtifact[]
}

export type RunResult = {
  assistantMessageId?: number
  usage?: ITokenUsage
  state: 'completed' | 'failed' | 'aborted'
  error?: SerializedError
}
