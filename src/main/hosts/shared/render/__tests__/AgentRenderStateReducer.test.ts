import { describe, expect, it } from 'vitest'
import { AgentRenderStateReducer } from '../AgentRenderStateReducer'

describe('AgentRenderStateReducer', () => {
  it('keeps tool execution timing separate from tool block appearance timing', () => {
    const reducer = new AgentRenderStateReducer()

    reducer.apply({
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 90
    })

    reducer.apply({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 100,
      delta: {
        type: 'tool_call_started',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'execute_command'
      },
      snapshot: {
        status: 'streaming',
        content: '',
        reasoning: '',
        toolCalls: [],
        model: undefined,
        responseId: undefined
      }
    } as any)

    reducer.apply({
      type: 'step.completed',
      timestamp: 130,
      step: {
        status: 'completed',
        stepId: 'step-1',
        stepIndex: 0,
        startedAt: 90,
        completedAt: 130,
        content: '',
        reasoning: '',
        toolCalls: [{
          id: 'tool-1',
          type: 'function',
          function: {
            name: 'execute_command',
            arguments: '{"command":"pwd"}'
          },
          index: 0
        }],
        finishReason: 'tool_calls'
      }
    } as any)

    reducer.apply({
      type: 'tool.execution_progress',
      phase: 'started',
      timestamp: 250,
      stepId: 'step-1',
      toolCallId: 'tool-1',
      toolCallIndex: 0,
      toolName: 'execute_command'
    })

    const finalState = reducer.apply({
      type: 'tool.execution_progress',
      phase: 'completed',
      timestamp: 258,
      result: {
        status: 'success',
        stepId: 'step-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        toolName: 'execute_command',
        executionStartedAt: 250,
        cost: 8,
        latencyCost: 158,
        content: { ok: true }
      }
    })

    expect(finalState.committed.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'tool',
        toolCallId: 'tool-1',
        startedAt: 100
      })
    ]))
    expect(finalState.committed.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        toolCallId: 'tool-1',
        status: 'success',
        executionStartedAt: 250,
        cost: 8,
        latencyCost: 158
      })
    ]))
  })
})
