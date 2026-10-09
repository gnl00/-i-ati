import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DefaultToolExecutorDispatcher } from '../ToolExecutorDispatcher'
import type { AgentEventEmitter } from '../../events/AgentEventEmitter'
import type { ToolExecutionResult } from '@main/agent/tools'
import type { ToolBatch } from '../ToolBatch'
import type { RuntimeClock } from '../../loop/RuntimeClock'

const executeMock = vi.fn()
let toolExecutorConfig: { onProgress?: (progress: { id: string; name: string; phase: 'started' }) => void } | undefined

vi.mock('@main/agent/tools/ToolExecutor', () => ({
  ToolExecutor: class {
    constructor(config: { onProgress?: (progress: { id: string; name: string; phase: 'started' }) => void }) {
      toolExecutorConfig = config
    }

    execute(calls: Array<{ id?: string; function: string }>): Promise<ToolExecutionResult[]> {
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
  emitToolExecutionOutput: vi.fn(async () => {}),
  emitToolExecutionCompleted: vi.fn(async () => {}),
  emitToolExecutionFailed: vi.fn(async () => {}),
  emitToolExecutionAborted: vi.fn(async () => {}),
  emitLoopCompleted: vi.fn(async () => {}),
  emitLoopFailed: vi.fn(async () => {}),
  emitLoopAborted: vi.fn(async () => {}),
  emitSteeringConsumed: vi.fn(async () => {})
})

const fetchBatch = (count: number): ToolBatch => ({
  batchId: 'fetch-batch', stepId: 'fetch-step', createdAt: 0,
  calls: Array.from({ length: count }, (_, index) => ({
    toolCallId: `fetch-${index}`, stepId: 'fetch-step', index, name: 'web_fetch',
    arguments: JSON.stringify({ url: `https://example.com/${index}` }),
    confirmationPolicy: { mode: 'not_required' }, status: 'pending'
  }))
})

describe('DefaultToolExecutorDispatcher', () => {
  it('preserves tool-owned views before publishing completion facts', async () => {
    const dispatcher = new DefaultToolExecutorDispatcher({
      runtimeClock: { now: (): number => 123 },
      executeToolCalls: async (): Promise<ToolExecutionResult[]> => [{ id: 'c', index: 0, name: 'exec',
        content: { stdout: 'raw' }, modelContent: 'tail', modelContentKind: 'text', cost: 1, status: 'success' }]
    })
    const outcome = await dispatcher.dispatch({ batchId: 'b', stepId: 's', createdAt: 1,
      calls: [{ toolCallId: 'c', stepId: 's', index: 0, name: 'exec', arguments: '{}',
        confirmationPolicy: { mode: 'not_required' }, status: 'pending' }] })
    expect(outcome).toMatchObject({ status: 'completed', results: [
      { content: { stdout: 'raw' }, modelContent: 'tail', modelContentKind: 'text' }
    ] })
  })

  beforeEach(() => {
    executeMock.mockReset()
    toolExecutorConfig = undefined
  })

  it('treats ask_user_question as an interaction barrier for later batch calls', async () => {
    const executeToolCalls = vi.fn(async (calls) => [{
      id: calls[0].id!,
      index: calls[0].index ?? 0,
      name: calls[0].function,
      content: { status: 'submitted', answers: [] },
      cost: 1,
      status: 'success' as const
    }])
    const dispatcher = new DefaultToolExecutorDispatcher({
      runtimeClock: { now: (): number => 123 },
      executeToolCalls
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-question',
      stepId: 'step-question',
      createdAt: 1,
      calls: [
        {
          toolCallId: 'question-1',
          stepId: 'step-question',
          index: 0,
          name: 'ask_user_question',
          arguments: '{}',
          confirmationPolicy: { mode: 'not_required' },
          status: 'pending'
        },
        {
          toolCallId: 'exec-1',
          stepId: 'step-question',
          index: 1,
          name: 'exec',
          arguments: '{"command":"echo stale"}',
          confirmationPolicy: { mode: 'not_required' },
          status: 'pending'
        }
      ]
    })

    expect(executeToolCalls).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual(expect.objectContaining({
      status: 'completed',
      results: [
        expect.objectContaining({ toolCallId: 'question-1', status: 'success' }),
        expect.objectContaining({
          toolCallId: 'exec-1',
          status: 'success',
          content: expect.objectContaining({ status: 'deferred_due_to_user_question' })
        })
      ]
    }))
  })

  it('waits for external confirmation and executes when approved', async () => {
    executeMock.mockResolvedValue([
      {
        id: 'tool-1',
        index: 0,
        name: 'exec',
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
          name: 'exec',
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

  it('preserves a structured processor failure in the runtime fact', async () => {
    const failure = {
      category: 'operation' as const,
      code: 'COMMAND_TIMEOUT',
      message: 'The command exceeded its time limit.',
      recovery: {
        action: 'check_state' as const,
        message: 'Inspect partial output before continuing.'
      },
      termination: 'timeout' as const
    }
    executeMock.mockResolvedValueOnce([{
      id: 'tool-timeout',
      index: 0,
      name: 'exec',
      content: { success: false, error: 'Command timeout after 10ms' },
      failure,
      cost: 10,
      status: 'success'
    }])

    const agentEventEmitter = createEventEmitter()
    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock: { now: (): number => 123 }
    })

    const outcome = await dispatcher.dispatch({
      batchId: 'batch-timeout',
      stepId: 'step-timeout',
      createdAt: 1,
      calls: [{
        toolCallId: 'tool-timeout',
        stepId: 'step-timeout',
        index: 0,
        name: 'exec',
        arguments: '{}',
        confirmationPolicy: { mode: 'not_required' },
        status: 'pending'
      }]
    })

    expect(outcome).toMatchObject({
      status: 'completed',
      results: [expect.objectContaining({ failure })]
    })
    expect(agentEventEmitter.emitToolExecutionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ failure }) })
    )
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
          name: 'exec',
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
          name: 'exec',
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
        name: 'exec',
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
          name: 'exec',
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
        toolName: 'exec'
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
        name: 'exec',
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
          name: 'exec',
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

  it('serializes started and output events before the terminal event', async () => {
    const order: string[] = []
    const agentEventEmitter = createEventEmitter()
    vi.mocked(agentEventEmitter.emitToolExecutionStarted).mockImplementation(async () => {
      await Promise.resolve()
      order.push('started')
    })
    vi.mocked(agentEventEmitter.emitToolExecutionOutput).mockImplementation(async event => {
      await Promise.resolve()
      order.push(`output:${event.output.sequence}`)
    })
    vi.mocked(agentEventEmitter.emitToolExecutionCompleted).mockImplementation(async () => {
      order.push('completed')
    })

    const dispatcher = new DefaultToolExecutorDispatcher({
      agentEventEmitter,
      runtimeClock: { now: vi.fn(() => 100) },
      executeToolCalls: async (calls, context): Promise<ToolExecutionResult[]> => {
        const call = calls[0]
        context.onProgress({
          id: call.id!,
          name: call.function,
          phase: 'started'
        })
        for (const sequence of [1, 2]) {
          context.onProgress({
            id: call.id!,
            name: call.function,
            phase: 'output',
            output: {
              toolCallId: call.id!,
              sequence,
              chunks: [{ stream: 'stdout', text: `${sequence}` }],
              stdoutBytes: sequence,
              stderrBytes: 0
            }
          })
        }
        return [{
          id: call.id!,
          index: call.index ?? 0,
          name: call.function,
          content: { success: true },
          cost: 1,
          status: 'success'
        }]
      }
    })

    await dispatcher.dispatch({
      batchId: 'batch-output',
      stepId: 'step-output',
      createdAt: 1,
      calls: [{
        toolCallId: 'tool-output',
        stepId: 'step-output',
        index: 0,
        name: 'exec',
        arguments: '{"command":"printf 12"}',
        confirmationPolicy: { mode: 'not_required' },
        status: 'pending'
      }]
    })

    expect(order).toEqual(['started', 'output:1', 'output:2', 'completed'])
  })
  it('starts three fetches together, publishes fast completion once, and queues the fourth', async () => {
    const emitter = createEventEmitter()
    const groups: string[][] = []
    const pending = new Map<string, (status?: ToolExecutionResult['status']) => void>()
    const executor = vi.fn(async (calls, context) => {
      groups.push(calls.map(call => call.id))
      return Promise.all(calls.map(call => new Promise<ToolExecutionResult>(resolve => {
        context.onProgress({ id: call.id, name: call.function, phase: 'started' })
        pending.set(call.id, (status = 'success') => {
          const result: ToolExecutionResult = { id: call.id, index: call.index, name: call.function,
            content: { source: call.id }, cost: 1, status }
          context.onProgress({ id: call.id, name: call.function, phase: 'completed', result })
          context.onProgress({ id: call.id, name: call.function, phase: 'completed', result })
          resolve(result)
        })
      })))
    })
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 },
      agentEventEmitter: emitter, executeToolCalls: executor })
    const dispatched = dispatcher.dispatch(fetchBatch(4))
    expect(groups).toEqual([['fetch-0', 'fetch-1', 'fetch-2']])
    pending.get('fetch-2')!()
    await vi.waitFor(() => expect(emitter.emitToolExecutionCompleted).toHaveBeenCalledTimes(1))
    expect(vi.mocked(emitter.emitToolExecutionCompleted).mock.calls[0][0].result.toolCallId).toBe('fetch-2')
    expect(groups).toHaveLength(1)
    pending.get('fetch-0')!('error')
    pending.get('fetch-1')!()
    await vi.waitFor(() => expect(groups).toHaveLength(2))
    expect(groups[1]).toEqual(['fetch-3'])
    pending.get('fetch-3')!()
    const outcome = await dispatched
    expect(outcome).toMatchObject({ status: 'completed', results: [
      { toolCallId: 'fetch-0', status: 'error' }, { toolCallId: 'fetch-1', status: 'success' },
      { toolCallId: 'fetch-2', status: 'success' }, { toolCallId: 'fetch-3', status: 'success' }
    ] })
    expect(emitter.emitToolExecutionCompleted).toHaveBeenCalledTimes(3)
    expect(emitter.emitToolExecutionFailed).toHaveBeenCalledTimes(1)
  })

  it('keeps other tools, required confirmations and questions between fetch groups', async () => {
    const batch = fetchBatch(8)
    batch.calls[2].name = 'write'
    batch.calls[4].confirmationPolicy = { mode: 'required', source: 'user',
      deniedResult: { status: 'denied', message: 'Denied' } }
    batch.calls[6].name = 'ask_user_question'
    const order: string[] = []
    const executeToolCalls = vi.fn(async calls => {
      order.push(calls.map(call => call.id).join(','))
      return calls.map(call => ({ id: call.id!, index: call.index!, name: call.function,
        content: { ok: true }, cost: 1, status: 'success' as const }))
    })
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 },
      executeToolCalls, requestConfirmation: async (): Promise<{ approved: boolean }> => { order.push('confirmation'); return { approved: true } } })
    const outcome = await dispatcher.dispatch(batch)
    expect(order).toEqual(['fetch-0,fetch-1', 'fetch-2', 'fetch-3', 'confirmation', 'fetch-4', 'fetch-5', 'fetch-6'])
    expect(outcome).toMatchObject({ status: 'completed', results: [ {}, {}, {}, {}, {}, {}, {},
      { toolCallId: 'fetch-7', content: { status: 'deferred_due_to_user_question' } }
    ] })
  })

  it('waits for all launched fetches on cancellation and never starts the next group', async () => {
    const controller = new AbortController()
    const pending = new Map<string, () => void>()
    const executor = vi.fn(async calls => Promise.all(calls.map(call => new Promise<ToolExecutionResult>(resolve => {
      pending.set(call.id!, () => resolve({ id: call.id!, index: call.index!, name: call.function,
        content: null, cost: 1, status: 'aborted', error: new Error('Cancelled') }))
    }))))
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 },
      signal: controller.signal, executeToolCalls: executor })
    let settled = false
    const dispatched = dispatcher.dispatch(fetchBatch(4)).then(outcome => { settled = true; return outcome })
    controller.abort(new Error('Cancelled'))
    pending.get('fetch-1')!()
    await Promise.resolve()
    expect(settled).toBe(false)
    pending.get('fetch-0')!()
    pending.get('fetch-2')!()
    expect(await dispatched).toMatchObject({ status: 'aborted', partialResults: [
      { toolCallId: 'fetch-0', status: 'aborted' }, { toolCallId: 'fetch-1', status: 'aborted' },
      { toolCallId: 'fetch-2', status: 'aborted' }
    ] })
    expect(executor).toHaveBeenCalledTimes(1)
  })

  it('stops after an aborted fetch group even when the parent signal stays live', async () => {
    const executeToolCalls = vi.fn(async calls => calls.map(call => ({ id: call.id!, index: call.index!,
      name: call.function, content: null, cost: 1,
      status: call.index === 1 ? 'aborted' as const : 'success' as const })))
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 }, executeToolCalls })
    expect(await dispatcher.dispatch(fetchBatch(4))).toMatchObject({ status: 'aborted', partialResults: [
      { toolCallId: 'fetch-0', status: 'success' }, { toolCallId: 'fetch-1', status: 'aborted' },
      { toolCallId: 'fetch-2', status: 'success' }
    ] })
    expect(executeToolCalls).toHaveBeenCalledTimes(1)
  })

  it('routes interleaved output by call and preserves each call event order and timing', async () => {
    const emitter = createEventEmitter()
    const events: string[] = []
    vi.mocked(emitter.emitToolExecutionStarted).mockImplementation(async e => { await Promise.resolve(); events.push('start:' + e.toolCallId) })
    vi.mocked(emitter.emitToolExecutionOutput).mockImplementation(async e => { events.push('output:' + e.toolCallId) })
    vi.mocked(emitter.emitToolExecutionCompleted).mockImplementation(async e => { events.push('done:' + e.result.toolCallId) })
    let now = 0
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => now }, agentEventEmitter: emitter,
      executeToolCalls: async (calls, context): Promise<ToolExecutionResult[]> => {
        for (const call of calls) context.onProgress({ id: call.id!, name: call.function, phase: 'started' })
        const results = calls.map(call => ({ id: call.id!, index: call.index!, name: call.function,
          content: null, cost: 1, status: 'success' as const }))
        for (const index of [1, 0]) {
          const call = calls[index]
          context.onProgress({ id: call.id!, name: call.function, phase: 'output', output: {
            toolCallId: call.id!, sequence: 1, chunks: [{ stream: 'stdout', text: String(index) }], stdoutBytes: 1, stderrBytes: 0 } })
          now = index === 1 ? 20 : 50
          context.onProgress({ id: call.id!, name: call.function, phase: 'completed', result: results[index] })
        }
        return results.reverse()
      } })
    const batch = fetchBatch(2)
    batch.calls.forEach(call => { call.startedAt = 0 })
    expect(await dispatcher.dispatch(batch)).toMatchObject({ status: 'completed', results: [
      { toolCallId: 'fetch-0', latencyCost: 50, executionStartedAt: 0 },
      { toolCallId: 'fetch-1', latencyCost: 20, executionStartedAt: 0 }
    ] })
    for (const id of ['fetch-0', 'fetch-1']) {
      expect(events.filter(e => e.endsWith(id))).toEqual(['start:' + id, 'output:' + id, 'done:' + id])
    }
  })

  it('keeps parent cancellation terminal after a successful final group', async () => {
    const controller = new AbortController()
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 },
      signal: controller.signal, abortedResultDisposition: 'non_terminal',
      executeToolCalls: async (calls): Promise<ToolExecutionResult[]> => {
        controller.abort(new Error('Stopped'))
        return calls.map(call => ({ id: call.id!, index: call.index!, name: call.function,
          content: { success: false, error: 'Stopped' }, cost: 1, status: 'success' as const }))
      } })
    expect(await dispatcher.dispatch(fetchBatch(2))).toMatchObject({ status: 'aborted', partialResults: [
      { toolCallId: 'fetch-0' }, { toolCallId: 'fetch-1' }
    ] })
  })

  it('does not start calls or request approval when the parent is already cancelled', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Stopped'))
    const executeToolCalls = vi.fn()
    const requestConfirmation = vi.fn()
    const batch = fetchBatch(1)
    batch.calls[0].confirmationPolicy = { mode: 'required', source: 'user',
      deniedResult: { status: 'denied', message: 'Denied' } }
    const dispatcher = new DefaultToolExecutorDispatcher({ runtimeClock: { now: (): number => 100 },
      signal: controller.signal, executeToolCalls, requestConfirmation })
    expect(await dispatcher.dispatch(batch)).toMatchObject({ status: 'aborted', partialResults: [] })
    expect(executeToolCalls).not.toHaveBeenCalled()
    expect(requestConfirmation).not.toHaveBeenCalled()
  })

})
