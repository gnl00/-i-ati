import type { ToolConfirmationRequester } from '@main/agent/contracts'
import type { MainAgentRunInput, RunPreparationResult } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { RunEventEmitter } from '../infrastructure'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'

export interface MainAgentRuntimeRunnerInput {
  runInput: MainAgentRunInput
  prepared: RunPreparationResult
  emitter: RunEventEmitter
  hostRenderSinks?: HostRenderEventSink[]
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
