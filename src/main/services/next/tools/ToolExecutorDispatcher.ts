/**
 * ToolExecutorDispatcher
 *
 * 放置内容：
 * - AgentLoop 侧看到的最小工具执行分发接口
 *
 * 业务逻辑边界：
 * - loop 只知道“给我一个 batch，我返回稳定的 dispatch outcome”
 * - 具体走 embedded tools、MCP 还是别的通道，由 dispatcher 后面的实现决定
 * - dispatcher 负责执行，不负责定义 confirmation policy
 * - loop 在收到 `completed` outcome 后，应把 tool result 回传模型，由模型决定下一步
 * - dispatcher 如果自身进入 failed / aborted，loop 应转入 terminal decision
 * - 执行过程中的 progress 事实应通过 events 广播，不直接写 transcript
 */
import type { ToolBatch } from './ToolBatch'
import type { ToolDispatchOutcome } from './ToolDispatchOutcome'
import type { AgentEventEmitter } from '../events/AgentEventEmitter'
import { ToolExecutor } from '@main/services/agent/tools'
import type { ToolCallProps } from '@main/services/agent/contracts'
import type {
  ToolResultFact,
  ToolDeniedFact,
  ToolFailureFact
} from './ToolResultFact'
import type { ToolExecutionResult } from '@main/services/agent/tools'
import type { RuntimeClock } from '../loop/RuntimeClock'

export interface ToolExecutorDispatcher {
  dispatch(batch: ToolBatch): Promise<ToolDispatchOutcome>
}

export interface DefaultToolExecutorDispatcherOptions {
  agentEventEmitter?: AgentEventEmitter
  signal?: AbortSignal
  runtimeClock: RuntimeClock
  executeToolCalls?: (calls: ToolCallProps[]) => Promise<ToolExecutionResult[]>
  abortedResultDisposition?: 'terminal' | 'non_terminal'
  requestConfirmation?: (input: {
    stepId: string
    toolCallId: string
    toolCallIndex: number
    toolName: string
    arguments: string
    policy: Extract<ToolBatch['calls'][number]['confirmationPolicy'], { mode: 'required' }>
  }) => Promise<{ approved: boolean; reason?: string; arguments?: string }>
}

const toToolCallProps = (call: ToolBatch['calls'][number]): ToolCallProps => ({
  id: call.toolCallId,
  index: call.index,
  function: call.name,
  args: call.arguments
})

const toDeniedFact = (
  call: ToolBatch['calls'][number]
): ToolDeniedFact => {
  if (call.confirmationPolicy.mode !== 'required') {
    throw new Error('Cannot materialize denied result for tool without confirmation policy')
  }

  return {
    stepId: call.stepId,
    toolCallId: call.toolCallId,
    toolCallIndex: call.index,
    toolName: call.name,
    status: 'denied',
    content: null,
    error: {
      message: call.confirmationPolicy.deniedResult.message,
      code: call.confirmationPolicy.deniedResult.code
    }
  }
}

const toToolResultFact = (
  stepId: string,
  result: ToolExecutionResult
): ToolResultFact => {
  if (result.status === 'success') {
  return {
    stepId,
    toolCallId: result.id,
    toolCallIndex: result.index,
    toolName: result.name,
    cost: result.cost,
    status: 'success',
    content: result.content
  }
  }

  if (result.status === 'aborted') {
    return {
      stepId,
      toolCallId: result.id,
      toolCallIndex: result.index,
      toolName: result.name,
      cost: result.cost,
      status: 'aborted',
      content: result.content,
      error: result.error ? {
        name: result.error.name,
        message: result.error.message
      } : undefined
    }
  }

  return {
    stepId,
    toolCallId: result.id,
    toolCallIndex: result.index,
    toolName: result.name,
    cost: result.cost,
    status: result.status,
    content: result.content,
    error: result.error ? {
      name: result.error.name,
      message: result.error.message
    } : undefined
  }
}

export class DefaultToolExecutorDispatcher implements ToolExecutorDispatcher {
  constructor(private readonly options: DefaultToolExecutorDispatcherOptions) {}

  async dispatch(batch: ToolBatch): Promise<ToolDispatchOutcome> {
    const results: ToolResultFact[] = []

    for (const call of batch.calls) {
      if (call.confirmationPolicy.mode === 'required') {
        await this.options.agentEventEmitter?.emitToolAwaitingConfirmation({
          timestamp: this.options.runtimeClock.now(),
          stepId: call.stepId,
          toolCallId: call.toolCallId,
          toolCallIndex: call.index,
          toolName: call.name
        })

        const decision = await this.options.requestConfirmation?.({
          stepId: call.stepId,
          toolCallId: call.toolCallId,
          toolCallIndex: call.index,
          toolName: call.name,
          arguments: call.arguments,
          policy: call.confirmationPolicy
        })

        if (decision?.approved) {
          const approvedCall = {
            ...call,
            arguments: decision.arguments ?? call.arguments
          }
          const result = await this.executeCall(approvedCall)
          results.push(result.result)
          if (result.terminalOutcome) {
            return result.terminalOutcome(batch, results)
          }
          continue
        }

        const deniedResult: ToolDeniedFact = toDeniedFact(call)

        await this.options.agentEventEmitter?.emitToolConfirmationDenied({
          timestamp: this.options.runtimeClock.now(),
          deniedResult
        })

        results.push(deniedResult)
        continue
      }

      const result = await this.executeCall(call)
      results.push(result.result)
      if (result.terminalOutcome) {
        return result.terminalOutcome(batch, results)
      }
    }

    return {
      status: 'completed',
      batchId: batch.batchId,
      stepId: batch.stepId,
      results
    }
  }

  private async executeCall(call: ToolBatch['calls'][number]): Promise<{
    result: ToolResultFact
    terminalOutcome?: (batch: ToolBatch, results: ToolResultFact[]) => ToolDispatchOutcome
  }> {
    await this.options.agentEventEmitter?.emitToolExecutionStarted({
      timestamp: this.options.runtimeClock.now(),
      stepId: call.stepId,
      toolCallId: call.toolCallId,
      toolCallIndex: call.index,
      toolName: call.name,
      phase: 'started'
    })

    const executionResults = this.options.executeToolCalls
      ? await this.options.executeToolCalls([toToolCallProps(call)])
      : await new ToolExecutor({
        signal: this.options.signal
      }).execute([toToolCallProps(call)])
    const executionResult = executionResults[0]
    const result = toToolResultFact(call.stepId, executionResult)

    if (result.status === 'aborted') {
      await this.options.agentEventEmitter?.emitToolExecutionAborted({
        timestamp: this.options.runtimeClock.now(),
        phase: 'aborted',
        result
      })

      if (this.options.abortedResultDisposition === 'non_terminal') {
        return { result }
      }

      return {
        result,
        terminalOutcome: (batch, results) => ({
          status: 'aborted',
          batchId: batch.batchId,
          stepId: batch.stepId,
          abortReason: result.error?.message || 'Tool execution aborted',
          partialResults: results
        })
      }
    }

    if (result.status === 'success') {
      await this.options.agentEventEmitter?.emitToolExecutionCompleted({
        timestamp: this.options.runtimeClock.now(),
        phase: 'completed',
        result
      })

      return { result }
    }

    const failureResult = result as ToolFailureFact
    await this.options.agentEventEmitter?.emitToolExecutionFailed({
      timestamp: this.options.runtimeClock.now(),
      phase: 'failed',
      result: failureResult
    })

    return { result }
  }
}
