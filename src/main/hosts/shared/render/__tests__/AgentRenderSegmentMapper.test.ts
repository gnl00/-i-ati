import { describe, expect, it } from 'vitest'
import { AgentRenderSegmentMapper } from '../AgentRenderSegmentMapper'
import type { AgentRenderMessageState } from '../AgentRenderState'

describe('AgentRenderSegmentMapper', () => {
  it('maps render blocks into stable message segments', () => {
    const mapper = new AgentRenderSegmentMapper()
    const state: AgentRenderMessageState = {
      stepId: 'step-1',
      content: 'answer',
      blocks: [
        {
          kind: 'reasoning',
          blockId: 'step-1:reasoning:0',
          stepId: 'step-1',
          content: 'thinking',
          startedAt: 1,
          endedAt: 2
        },
        {
          kind: 'text',
          blockId: 'step-1:text:0',
          stepId: 'step-1',
          content: 'answer',
          startedAt: 3
        },
        {
          kind: 'tool',
          blockId: 'step-1:tool:tool-1',
          stepId: 'step-1',
          toolCallId: 'tool-1',
          startedAt: 4
        }
      ],
      toolCalls: [
        {
          toolCallId: 'tool-1',
          toolCallIndex: 0,
          name: 'memory_retrieval',
          args: '{"query":"x"}',
          status: 'success',
          result: { ok: true },
          cost: 42
        }
      ]
    }

    expect(mapper.buildSegments({
      state,
      timestamp: 5,
      includeText: true,
      layer: 'committed'
    })).toEqual([
      {
        type: 'reasoning',
        segmentId: 'committed:step-1:reasoning:0',
        content: 'thinking',
        timestamp: 1,
        endedAt: 2
      },
      {
        type: 'text',
        segmentId: 'committed:step-1:text:0',
        content: 'answer',
        timestamp: 3
      },
      expect.objectContaining({
        type: 'toolCall',
        segmentId: 'committed:step-1:tool:tool-1',
        toolCallId: 'tool-1',
        toolCallIndex: 0,
        name: 'memory_retrieval',
        content: {
          toolName: 'memory_retrieval',
          args: '{"query":"x"}',
          status: 'success',
          result: { ok: true }
        },
        cost: 42,
        isError: false,
        timestamp: 4
      })
    ])
  })

  it('marks configured hidden tools as not transcript visible', () => {
    const mapper = new AgentRenderSegmentMapper()
    const state: AgentRenderMessageState = {
      stepId: 'step-1',
      content: '',
      blocks: [
        {
          kind: 'tool',
          blockId: 'step-1:tool:emotion',
          stepId: 'step-1',
          toolCallId: 'emotion',
          startedAt: 1
        }
      ],
      toolCalls: [
        {
          toolCallId: 'emotion',
          toolCallIndex: 0,
          name: 'emotion_report',
          status: 'success'
        }
      ]
    }

    expect(mapper.buildSegments({
      state,
      timestamp: 2,
      includeText: true,
      layer: 'preview'
    })).toEqual([
      expect.objectContaining({
        type: 'toolCall',
        segmentId: 'preview:step-1:tool:emotion',
        presentation: {
          transcriptVisible: false
        }
      })
    ])
  })

  it('builds preview text and reasoning patches from the latest matching segment', () => {
    const mapper = new AgentRenderSegmentMapper()
    const state: AgentRenderMessageState = {
      stepId: 'step-1',
      content: 'hello',
      blocks: [
        {
          kind: 'reasoning',
          blockId: 'step-1:reasoning:0',
          stepId: 'step-1',
          content: 'think',
          startedAt: 1
        },
        {
          kind: 'text',
          blockId: 'step-1:text:0',
          stepId: 'step-1',
          content: 'hello',
          startedAt: 2
        }
      ],
      toolCalls: []
    }

    expect(mapper.buildTextPatch({
      state,
      layer: 'preview',
      content: state.content,
      typewriterCompleted: false
    })).toEqual({
      segment: {
        type: 'text',
        segmentId: 'preview:step-1:text:0',
        content: 'hello',
        timestamp: 2
      },
      content: 'hello',
      typewriterCompleted: false
    })

    expect(mapper.buildReasoningPatch({
      state,
      layer: 'preview',
      typewriterCompleted: false
    })).toEqual({
      segment: {
        type: 'reasoning',
        segmentId: 'preview:step-1:reasoning:0',
        content: 'think',
        timestamp: 1,
        endedAt: undefined
      },
      typewriterCompleted: false
    })
  })
})
