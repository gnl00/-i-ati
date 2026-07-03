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

  describe('lastPreviewEffect (P2 preview append semantics)', () => {
    const started = (reducer: AgentRenderStateReducer) => {
      reducer.apply({
        type: 'step.started',
        stepId: 'step-1',
        stepIndex: 0,
        timestamp: 100
      })
    }

    const contentDelta = (
      reducer: AgentRenderStateReducer,
      content: string,
      accumulated: string,
      timestamp: number,
      reasoning = ''
    ) => reducer.apply({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp,
      delta: { type: 'content_delta', content },
      snapshot: {
        status: 'streaming',
        content: accumulated,
        reasoning,
        toolCalls: [],
        model: undefined,
        responseId: undefined
      }
    } as any)

    const reasoningDelta = (
      reducer: AgentRenderStateReducer,
      reasoning: string,
      accumulated: string,
      timestamp: number,
      content = ''
    ) => reducer.apply({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp,
      delta: { type: 'reasoning_delta', reasoning },
      snapshot: {
        status: 'streaming',
        content,
        reasoning: accumulated,
        toolCalls: [],
        model: undefined,
        responseId: undefined
      }
    } as any)

    it('first block yields replace (empty preview -> new block)', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      contentDelta(reducer, 'Hel', 'Hel', 101)
      expect(reducer.lastPreviewEffect).toBe('replace')
    })

    it('appending to the same open text block yields text_append', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      contentDelta(reducer, 'Hel', 'Hel', 101)
      contentDelta(reducer, 'lo', 'Hello', 102)
      expect(reducer.lastPreviewEffect).toBe('text_append')
    })

    it('appending to the same open reasoning block yields reasoning_append', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      reasoningDelta(reducer, 'think-a', 'think-a', 101)
      expect(reducer.lastPreviewEffect).toBe('replace')
      reasoningDelta(reducer, 'think-b', 'think-athink-b', 102)
      expect(reducer.lastPreviewEffect).toBe('reasoning_append')
    })

    it('reasoning -> text transition yields replace (new block appended)', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      reasoningDelta(reducer, 'think-a', 'think-a', 101)
      // reasoning block still open; first content delta closes it and opens a text block
      contentDelta(reducer, 'Hel', 'Hel', 110, 'think-a')
      expect(reducer.lastPreviewEffect).toBe('replace')
    })

    it('inserting a tool block yields replace', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      contentDelta(reducer, 'Hel', 'Hel', 101)
      contentDelta(reducer, 'lo', 'Hello', 102)
      expect(reducer.lastPreviewEffect).toBe('text_append')
      reducer.apply({
        type: 'step.delta',
        stepId: 'step-1',
        stepIndex: 0,
        timestamp: 120,
        delta: {
          type: 'tool_call_ready',
          toolCall: {
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: { name: 'read', arguments: '{"path":"README.md"}' }
          }
        },
        snapshot: {
          status: 'streaming',
          content: 'Hello',
          reasoning: '',
          toolCalls: [{
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: { name: 'read', arguments: '{"path":"README.md"}' }
          }],
          model: undefined,
          responseId: undefined
        }
      } as any)
      expect(reducer.lastPreviewEffect).toBe('replace')
    })

    it('re-opening a new text block after the previous one closed yields replace', () => {
      const reducer = new AgentRenderStateReducer()
      started(reducer)
      contentDelta(reducer, 'Hel', 'Hel', 101)
      // reasoning delta closes the open text block and opens a reasoning block (length +1)
      reasoningDelta(reducer, 'think', 'think', 110, 'Hel')
      expect(reducer.lastPreviewEffect).toBe('replace')
      // next content delta closes reasoning block and opens a fresh text block (length +1)
      contentDelta(reducer, 'World', 'HelWorld', 120, 'think')
      expect(reducer.lastPreviewEffect).toBe('replace')
    })
  })
})
