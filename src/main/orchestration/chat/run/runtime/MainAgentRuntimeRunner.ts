import type { ToolConfirmationRequester } from '@main/agent/contracts'
import type { MainAgentRunInput, RunPreparationResult } from '@main/hosts/chat/preparation/types'
import type { HostRenderEventSink } from '@main/hosts/shared/render'
import type { PermissionApprovalMode } from '@tools/approval'
import type { RunEventEmitter } from '../infrastructure'
import type { MainAgentRuntimeTerminalResult } from './MainAgentRuntimeResult'

export interface MainAgentRuntimeContext {
  getPermissionApprovalMode(): PermissionApprovalMode | undefined
  setPermissionApprovalMode(mode: PermissionApprovalMode | undefined): void
}

export interface MainAgentRuntimeRunnerInput {
  runInput: MainAgentRunInput
  prepared: RunPreparationResult
  runtimeContext?: MainAgentRuntimeContext
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
