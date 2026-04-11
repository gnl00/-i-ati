/**
 * AgentEventEmitter
 *
 * 放置内容：
 * - loop 使用的高层事件发射 contract
 *
 * 业务逻辑边界：
 * - 它负责把 runtime 事实组装成稳定 `AgentEvent` 并发出
 * - `AgentLoop` 应依赖它，而不是直接手写 `AgentEvent` payload
 * - 它可以在内部委托 `AgentEventBus`
 */
import type {
  StepStartedEvent,
  StepDeltaEvent,
  StepCompletedEvent,
  StepFailedEvent,
  StepAbortedEvent
} from './StepEvent'
import type {
  ToolAwaitingConfirmationEvent,
  ToolConfirmationDeniedEvent,
  ToolExecutionStartedEvent,
  ToolExecutionCompletedEvent,
  ToolExecutionFailedEvent,
  ToolExecutionAbortedEvent
} from './ToolEvent'
import type {
  LoopCompletedEvent,
  LoopFailedEvent,
  LoopAbortedEvent
} from './LoopEvent'
import type { AgentEventBus } from './AgentEventBus'

export interface AgentEventEmitter {
  emitStepStarted(input: Omit<StepStartedEvent, 'type'>): Promise<void>
  emitStepDelta(input: Omit<StepDeltaEvent, 'type'>): Promise<void>
  emitStepCompleted(input: Omit<StepCompletedEvent, 'type'>): Promise<void>
  emitStepFailed(input: Omit<StepFailedEvent, 'type'>): Promise<void>
  emitStepAborted(input: Omit<StepAbortedEvent, 'type'>): Promise<void>

  emitToolAwaitingConfirmation(
    input: Omit<ToolAwaitingConfirmationEvent, 'type'>
  ): Promise<void>
  emitToolConfirmationDenied(
    input: Omit<ToolConfirmationDeniedEvent, 'type'>
  ): Promise<void>
  emitToolExecutionStarted(
    input: Omit<ToolExecutionStartedEvent, 'type'>
  ): Promise<void>
  emitToolExecutionCompleted(
    input: Omit<ToolExecutionCompletedEvent, 'type'>
  ): Promise<void>
  emitToolExecutionFailed(
    input: Omit<ToolExecutionFailedEvent, 'type'>
  ): Promise<void>
  emitToolExecutionAborted(
    input: Omit<ToolExecutionAbortedEvent, 'type'>
  ): Promise<void>

  emitLoopCompleted(input: Omit<LoopCompletedEvent, 'type'>): Promise<void>
  emitLoopFailed(input: Omit<LoopFailedEvent, 'type'>): Promise<void>
  emitLoopAborted(input: Omit<LoopAbortedEvent, 'type'>): Promise<void>
}

export class DefaultAgentEventEmitter implements AgentEventEmitter {
  constructor(private readonly agentEventBus: AgentEventBus) {}

  private emit(event: StepStartedEvent | StepDeltaEvent | StepCompletedEvent | StepFailedEvent | StepAbortedEvent | ToolAwaitingConfirmationEvent | ToolConfirmationDeniedEvent | ToolExecutionStartedEvent | ToolExecutionCompletedEvent | ToolExecutionFailedEvent | ToolExecutionAbortedEvent | LoopCompletedEvent | LoopFailedEvent | LoopAbortedEvent): Promise<void> {
    return Promise.resolve(this.agentEventBus.emit(event))
  }

  emitStepStarted(input: Omit<StepStartedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'step.started', ...input })
  }

  emitStepDelta(input: Omit<StepDeltaEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'step.delta', ...input })
  }

  emitStepCompleted(input: Omit<StepCompletedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'step.completed', ...input })
  }

  emitStepFailed(input: Omit<StepFailedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'step.failed', ...input })
  }

  emitStepAborted(input: Omit<StepAbortedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'step.aborted', ...input })
  }

  emitToolAwaitingConfirmation(
    input: Omit<ToolAwaitingConfirmationEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.awaiting_confirmation', ...input })
  }

  emitToolConfirmationDenied(
    input: Omit<ToolConfirmationDeniedEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.confirmation_denied', ...input })
  }

  emitToolExecutionStarted(
    input: Omit<ToolExecutionStartedEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.execution_progress', ...input })
  }

  emitToolExecutionCompleted(
    input: Omit<ToolExecutionCompletedEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.execution_progress', ...input })
  }

  emitToolExecutionFailed(
    input: Omit<ToolExecutionFailedEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.execution_progress', ...input })
  }

  emitToolExecutionAborted(
    input: Omit<ToolExecutionAbortedEvent, 'type'>
  ): Promise<void> {
    return this.emit({ type: 'tool.execution_progress', ...input })
  }

  emitLoopCompleted(input: Omit<LoopCompletedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'loop.completed', ...input })
  }

  emitLoopFailed(input: Omit<LoopFailedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'loop.failed', ...input })
  }

  emitLoopAborted(input: Omit<LoopAbortedEvent, 'type'>): Promise<void> {
    return this.emit({ type: 'loop.aborted', ...input })
  }
}
