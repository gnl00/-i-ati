import { describe, expect, it } from 'vitest'
import { HostRenderEventMapper } from '../HostRenderEventMapper'

describe('HostRenderEventMapper', () => {
  it('maps step deltas into host preview updates', () => {
    const mapper = new HostRenderEventMapper()

    mapper.map({
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 1
    })

    const events = mapper.map({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 2,
      delta: {
        type: 'content_delta',
        content: 'Hello'
      },
      snapshot: {
        status: 'streaming',
        content: 'Hello',
        reasoning: '',
        toolCalls: [],
        model: undefined,
        responseId: undefined
      }
    } as any)

    expect(events).toEqual([
      expect.objectContaining({
        type: 'host.preview.updated',
        timestamp: 2
      })
    ])
  })

  it('maps tool call readiness into host tool detection events', () => {
    const mapper = new HostRenderEventMapper()

    const events = mapper.map({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 2,
      delta: {
        type: 'tool_call_ready',
        toolCall: {
          id: 'tool-1',
          index: 0,
          type: 'function',
          function: {
            name: 'plan_create',
            arguments: '{"goal":"refactor host"}'
          }
        }
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

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'host.tool.detected',
        timestamp: 2,
        toolCallId: 'tool-1',
        toolName: 'plan_create',
        toolArgs: '{"goal":"refactor host"}'
      }),
      expect.objectContaining({
        type: 'host.preview.updated',
        timestamp: 2
      })
    ]))
  })

  it('maps completed steps into preview clear plus committed update', () => {
    const mapper = new HostRenderEventMapper()

    mapper.map({
      type: 'step.started',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 1
    })

    mapper.map({
      type: 'step.delta',
      stepId: 'step-1',
      stepIndex: 0,
      timestamp: 2,
      delta: {
        type: 'content_delta',
        content: 'Hello'
      },
      snapshot: {
        status: 'streaming',
        content: 'Hello',
        reasoning: '',
        toolCalls: [],
        model: undefined,
        responseId: undefined
      }
    } as any)

    const events = mapper.map({
      type: 'step.completed',
      timestamp: 3,
      step: {
        stepId: 'step-1',
        status: 'completed',
        stepIndex: 0,
        startedAt: 1,
        completedAt: 3,
        content: 'Hello',
        reasoning: '',
        toolCalls: [],
        usage: undefined,
        model: undefined,
        responseId: undefined,
        raw: undefined
      }
    } as any)

    expect(events).toEqual([
      expect.objectContaining({ type: 'host.preview.cleared', timestamp: 3 }),
      expect.objectContaining({
        type: 'host.committed.updated',
        timestamp: 3,
        previewWasActive: true
      })
    ])
  })
})
