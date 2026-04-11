import type { ToolConfirmationRequester } from '@main/services/agent/contracts'
import type { MainChatRunInput, RunPreparationResult } from '@main/services/hostAdapters/chat/preparation/types'
import type { ChatRunEventEmitter } from '../infrastructure'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'

export interface MainAgentRuntimeRunnerInput {
  runInput: MainChatRunInput
  prepared: RunPreparationResult
  emitter: ChatRunEventEmitter
  signal: AbortSignal
  toolConfirmationRequester: ToolConfirmationRequester
}

export interface MainAgentRuntimeRunResult {
  runtimeResult: MainAgentRuntimeTerminalResult
  stepCommitter: {
    getFinalAssistantMessage(): MessageEntity
    getLastUsage(): ITokenUsage | undefined
  }
}

export interface MainAgentRuntimeRunner {
  run(input: MainAgentRuntimeRunnerInput): Promise<MainAgentRuntimeRunResult>
}
