import type { RunState } from '@shared/run/lifecycle-events'
import type { ToolResultFact } from '@main/agent/runtime/tools/ToolResultFact'
import type { AgentRenderMessageState } from './AgentRenderState'
import type { ToolOutputBatch } from '@main/agent/tools'
import type { PreviewEffect } from './AgentRenderStateReducer'

export interface HostRenderPreviewUpdatedEvent {
  type: 'host.preview.updated'
  timestamp: number
  preview: AgentRenderMessageState
  /**
   * 本次 preview 更新的语义，由 HostRenderEventMapper 内部 reducer（唯一 fold 点）计算。
   *
   * P2：append 语义前移。host 侧直接按此字段决定 emit：
   * - 'text_append' / 'reasoning_append'：只发对应 segment patch（同一 open block 追加）
   * - 'replace'：发完整 preview
   * 下游不再自己比较 previous/next blocks 把这个语义 diff 回来。
   */
  previewEffect: PreviewEffect
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

export interface HostRenderToolExecutionOutputEvent {
  type: 'host.tool.execution.output'
  timestamp: number
  stepId: string
  toolCallId: string
  toolCallIndex: number
  toolName: string
  output: ToolOutputBatch
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
  | HostRenderToolExecutionOutputEvent
  | HostRenderToolResultAvailableEvent
