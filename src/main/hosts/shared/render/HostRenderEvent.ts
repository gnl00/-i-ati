import type { RunState } from '@shared/run/lifecycle-events'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type { AgentRenderMessageState } from './AgentRenderState'

export interface HostRenderPreviewUpdatedEvent {
  type: 'host.preview.updated'
  timestamp: number
  preview: AgentRenderMessageState
}

export interface HostRenderPreviewClearedEvent {
  type: 'host.preview.cleared'
  timestamp: number
}

export interface HostRenderCommittedUpdatedEvent {
  type: 'host.committed.updated'
  timestamp: number
  committed: AgentRenderMessageState
  previewWasActive: boolean
}

export interface HostRenderLifecycleUpdatedEvent {
  type: 'host.lifecycle.updated'
  timestamp: number
  state: RunState
}

export interface HostRenderUsageUpdatedEvent {
  type: 'host.usage.updated'
  timestamp: number
  usage: ITokenUsage
}

export interface HostRenderToolConfirmationRequiredEvent {
  type: 'host.tool.confirmation.required'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
}

export interface HostRenderToolExecutionStartedEvent {
  type: 'host.tool.execution.started'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
}

export interface HostRenderToolDetectedEvent {
  type: 'host.tool.detected'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
  toolArgs?: string
}

export interface HostRenderToolResultAvailableEvent {
  type: 'host.tool.result.available'
  timestamp: number
  result: ToolResultFact
}

export type HostRenderEvent =
  | HostRenderPreviewUpdatedEvent
  | HostRenderPreviewClearedEvent
  | HostRenderCommittedUpdatedEvent
  | HostRenderLifecycleUpdatedEvent
  | HostRenderUsageUpdatedEvent
  | HostRenderToolDetectedEvent
  | HostRenderToolConfirmationRequiredEvent
  | HostRenderToolExecutionStartedEvent
  | HostRenderToolResultAvailableEvent
