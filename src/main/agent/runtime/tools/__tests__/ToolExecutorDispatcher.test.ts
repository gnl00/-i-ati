import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultToolExecutorDispatcher } from '../ToolExecutorDispatcher'
import type { AgentEventEmitter } from '../../events/AgentEventEmitter'
import type { RuntimeClock } from '../../loop/RuntimeClock'

const executeMock = vi.fn()
let toolExecutorConfig: { onProgress?: (progress: { id: string; name: string; phase: 'started' }) => void } | undefined

vi.mock('@main/agent/tools/ToolExecutor', () => ({
  ToolExecutor: class {
    constructor(config: { onProgress?: (progress: { id: string; name: string; phase: 'started' }) => void }) {
      toolExecutorConfig = config
    }

    execute(calls: Array<{ id?: string; function: string }>) {
      const call = calls[0]
      if (call.id) {
        toolExecutorConfig?.onProgress?.({
          id: call.id,
          name: call.function,
          phase: 'started'
        })
      }
      return executeMock(calls)
    }
  }
}))

const createEventEmitter = (): AgentEventEmitter => ({
  emitStepStarted: vi.fn(async () => {}),
  emitStepDelta: vi.fn(async () => {}),
  emitStepCompleted: vi.fn(async () => {}),
  emitStepFailed: vi.fn(async () => {}),
  emitStepAborted: vi.fn(async () => {}),
  emitToolAwaitingConfirmation: vi.fn(async () => {}),
  emitToolConfirmationDenied: vi.fn(async () => {}),
  emitToolExecutionStarted: vi.fn(async () => {}),
  emitToolExecutionCompleted: vi.fn(async () => {}),
  emitToolExecutionFailed: vi.fn(async () => {}),
  emitToolExecutionAborted: vi.fn(async () => {}),
  emitLoopCompleted: vi.fn(async () => {}),
  emitLoopFailed: vi.fn(async () => {}),
  emitLoopAborted: vi.fn(async () => {})
})

describe('DefaultToolExecutorDispatcher', () => {
  beforeEach(() => {
    executeMock.mockReset()
    toolExecutorConfig = undefined
  })

  it('waits for external confirmation and executes when approved', async () => {
    executeMock.mockResolvedValue([
      {
        id: 'tool-1',
        index: 0,
        name: 'execute_command',
        content: { ok: true },
        cost: 1,
        status: 'success'
      }
    ])

    const agentEventEmitter = createEventEmitter()
    const runtimeClock: RuntimeClock = {
      now: vi.fn(() => 123)
    }
    const requestConfirmation = vi.fn(async () => ({
      approved: true,
      arguments: '{"command":"echo approved"}'
    }))

    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock,
      requestConfirmation
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-1',
      stepId: 'step-1',
      createdAt: 1,
      calls: [
        {
          toolCallId: 'tool-1',
          stepId: 'step-1',
          index: 0,
          name: 'execute_command',
          arguments: '{"command":"echo original"}',
          confirmationPolicy: {
            mode: 'required',
            source: 'user',
            deniedResult: {
              status: 'denied',
              message: 'rejected'
            }
          },
          status: 'pending'
        }
      ]
    })

    expect(outcome.status).toBe('completed')
    expect(requestConfirmation).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'tool-1',
        args: '{"command":"echo approved"}'
      })
    ])
    expect(agentEventEmitter.emitToolAwaitingConfirmation).toHaveBeenCalledTimes(1)
    expect(agentEventEmitter.emitToolConfirmationDenied).not.toHaveBeenCalled()
    expect(agentEventEmitter.emitToolExecutionStarted).toHaveBeenCalledTimes(1)
  })

  it('emits injected execution start only after confirmation resolves', async () => {
    const events: string[] = []
    const agentEventEmitter = createEventEmitter()
    vi.mocked(agentEventEmitter.emitToolAwaitingConfirmation).mockImplementation(async () => {
      events.push('awaiting_confirmation')
    })
    vi.mocked(agentEventEmitter.emitToolExecutionStarted).mockImplementation(async () => {
      events.push('started')
    })
    vi.mocked(agentEventEmitter.emitToolExecutionCompleted).mockImplementation(async () => {
      events.push('completed')
    })
    const runtimeClock: RuntimeClock = {
      now: vi.fn(() => 123)
    }
    const requestConfirmation = vi.fn(async () => {
      events.push('request_confirmation')
      return {
        approved: true,
        arguments: '{"command":"echo approved"}'
      }
    })
    const executeToolCalls = vi.fn(async (calls, context) => {
      events.push('execute_tool_calls')
      context.onProgress({
        id: calls[0].id!,
        name: calls[0].function,
        phase: 'started'
      })
      return [
        {
          id: 'tool-1',
          index: 0,
          name: 'execute_command',
          content: { ok: true },
          cost: 1,
          status: 'success' as const
        }
      ]
    })

    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock,
      requestConfirmation,
      executeToolCalls
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-1',
      stepId: 'step-1',
      createdAt: 1,
      calls: [
        {
          toolCallId: 'tool-1',
          stepId: 'step-1',
          index: 0,
          name: 'execute_command',
          arguments: '{"command":"echo original"}',
          confirmationPolicy: {
            mode: 'required',
            source: 'user',
            deniedResult: {
              status: 'denied',
              message: 'rejected'
            }
          },
          status: 'pending'
        }
      ]
    })

    expect(outcome.status).toBe('completed')
    expect(executeToolCalls).toHaveBeenCalledTimes(1)
    expect(agentEventEmitter.emitToolExecutionStarted).toHaveBeenCalledTimes(1)
    expect(events).toEqual([
      'awaiting_confirmation',
      'request_confirmation',
      'execute_tool_calls',
      'started',
      'completed'
    ])
  })

  it('can treat aborted tool execution as non-terminal and keep result in completed outcome', async () => {
    executeMock.mockResolvedValue([
      {
        id: 'tool-1',
        index: 0,
        name: 'execute_command',
        content: null,
        cost: 1,
        status: 'aborted',
        error: new Error('user denied')
      }
    ])

    const agentEventEmitter = createEventEmitter()
    const runtimeClock: RuntimeClock = {
      now: vi.fn(() => 123)
    }

    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock,
      abortedResultDisposition: 'non_terminal'
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-1',
      stepId: 'step-1',
      createdAt: 1,
      calls: [
        {
          toolCallId: 'tool-1',
          stepId: 'step-1',
          index: 0,
          name: 'execute_command',
          arguments: '{"command":"echo denied"}',
          confirmationPolicy: {
            mode: 'not_required'
          },
          status: 'pending'
        }
      ]
    })

    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') {
      throw new Error('Expected completed outcome')
    }
    expect(outcome.results).toEqual([
      expect.objectContaining({
        status: 'aborted',
        toolName: 'execute_command'
      })
    ])
    expect(agentEventEmitter.emitToolExecutionAborted).toHaveBeenCalledTimes(1)
    expect(agentEventEmitter.emitLoopAborted).not.toHaveBeenCalled()
  })

  it('keeps execution cost separate from model-to-complete latency', async () => {
    executeMock.mockResolvedValue([
      {
        id: 'tool-1',
        index: 0,
        name: 'execute_command',
        content: { ok: true },
        cost: 300,
        status: 'success'
      }
    ])

    const agentEventEmitter = createEventEmitter()
    const runtimeClock: RuntimeClock = {
      now: vi.fn()
        .mockReturnValueOnce(1200)
        .mockReturnValueOnce(2600)
    }

    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-1',
      stepId: 'step-1',
      createdAt: 1,
      calls: [
        {
          toolCallId: 'tool-1',
          stepId: 'step-1',
          index: 0,
          name: 'execute_command',
          arguments: '{"command":"echo ok"}',
          startedAt: 1000,
          confirmationPolicy: {
            mode: 'not_required'
          },
          status: 'pending'
        }
      ]
    })

    expect(outcome.status).toBe('completed')
    if (outcome.status !== 'completed') {
      throw new Error('Expected completed outcome')
    }
    expect(outcome.results[0]).toEqual(expect.objectContaining({
      toolCallId: 'tool-1',
      cost: 300,
      executionStartedAt: 1200,
      latencyCost: 1600
    }))
    expect(agentEventEmitter.emitToolExecutionCompleted).toHaveBeenCalledWith(expect.objectContaining({
      timestamp: 2600,
      result: expect.objectContaining({
        cost: 300,
        executionStartedAt: 1200,
        latencyCost: 1600
      })
    }))
  })
})
