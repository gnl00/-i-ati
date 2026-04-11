import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultToolExecutorDispatcher } from '../ToolExecutorDispatcher'
import type { AgentEventEmitter } from '../../events/AgentEventEmitter'
import type { RuntimeClock } from '../../loop/RuntimeClock'

const executeMock = vi.fn()

vi.mock('@main/services/agentCore/tools/ToolExecutor', () => ({
  ToolExecutor: class {
    execute = executeMock
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
})
