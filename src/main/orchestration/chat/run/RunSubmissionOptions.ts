import type { ToolConfirmationRequester, RunResult } from '@main/agent/contracts'
import type { AgentEventSink } from '@main/agent/runtime/events/AgentEventSink'
import type { AgentLoopResult } from '@main/agent/runtime/loop/AgentLoopResult'
import type {
  RunPreparationOptions,
  RunPreparationResult
} from '@main/hosts/chat/preparation/types'

/** Main-local host policy; never accepted from renderer IPC payloads. */
export interface RunSubmissionOptions {
  preparation?: RunPreparationOptions
  execution?: { maxSteps: number }
  signal?: AbortSignal
  agentEventSinks?: AgentEventSink[]
  onPrepared?: (prepared: RunPreparationResult) => void | Promise<void>
  toolConfirmationRequester?: ToolConfirmationRequester
  postRunJobs?: boolean
}

/** Preserves runtime evidence even when host finalization fails. */
export interface RunOutcome {
  result: RunResult
  agentResult?: AgentLoopResult
}
