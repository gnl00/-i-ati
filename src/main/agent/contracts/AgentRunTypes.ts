import type { SerializedError } from '@shared/run/lifecycle-events'
import type { AgentRequestSpec } from '@main/agent/runtime/request/AgentRequestSpec'

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

export type ChatInitialTranscriptSeedContent = string | VLMContent[]

export type ChatInitialTranscriptSeed =
  | {
      kind: 'user'
      timestamp?: number
      source?: string
      content: ChatInitialTranscriptSeedContent
    }
  | {
      kind: 'assistant'
      timestamp?: number
      model?: string
      content: ChatInitialTranscriptSeedContent
      reasoning?: string
      toolCalls?: IToolCall[]
    }
  | {
      kind: 'tool'
      timestamp?: number
      toolCallId?: string
      toolName?: string
      content: ChatInitialTranscriptSeedContent
    }

export type RunSpec = {
  submissionId: string
  modelContext: RunModelContext
  requestSpec: AgentRequestSpec
  initialTranscriptSeed: ChatInitialTranscriptSeed[]
  runtimeContext: {
    chatId?: number
    chatUuid?: string
    workspacePath?: string
  }
}

export type StepResult = {
  usage?: ITokenUsage
}

export type RunResult = {
  userMessageId?: number
  assistantMessageId?: number
  usage?: ITokenUsage
  state: 'completed' | 'failed' | 'aborted'
  error?: SerializedError
}
