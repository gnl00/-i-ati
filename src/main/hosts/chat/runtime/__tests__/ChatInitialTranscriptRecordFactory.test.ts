import { describe, expect, it } from 'vitest'
import type { LoopIdentityProvider } from '@main/agent/runtime/loop/LoopIdentityProvider'
import { DefaultChatInitialTranscriptRecordFactory } from '../ChatInitialTranscriptRecordFactory'

const createLoopIdentityProvider = (): LoopIdentityProvider => {
  let transcriptIndex = 0
  let stepIndex = 0
  let recordIndex = 0
  let batchIndex = 0

  return {
    nextTranscriptId: () => `transcript-${++transcriptIndex}`,
    nextStepId: () => `step-${++stepIndex}`,
    nextTranscriptRecordId: () => `record-${++recordIndex}`,
    nextToolBatchId: () => `batch-${++batchIndex}`
  }
}

describe('DefaultChatInitialTranscriptRecordFactory', () => {
  it('converts user string and VLM content to transcript parts', () => {
    const factory = new DefaultChatInitialTranscriptRecordFactory()

    const records = factory.create({
      initialTranscriptSeed: [
        {
          kind: 'user',
          content: 'hello',
          timestamp: 11
        },
        {
          kind: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image_url', image_url: { url: 'file://image.png', detail: 'high' } },
            { type: 'image_url', image_url: { url: 'file://auto.png', detail: undefined as any } }
          ]
        }
      ],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([
      {
        recordId: 'record-1',
        kind: 'user',
        timestamp: 11,
        content: [{ type: 'input_text', text: 'hello' }]
      },
      {
        recordId: 'record-2',
        kind: 'user',
        timestamp: 20,
        content: [
          { type: 'input_text', text: 'look' },
          { type: 'input_image', imageUrl: 'file://image.png', detail: 'high' },
          { type: 'input_image', imageUrl: 'file://auto.png', detail: 'auto' }
        ]
      }
    ])
  })

  it('converts assistant reasoning and tool calls to assistant_step records', () => {
    const factory = new DefaultChatInitialTranscriptRecordFactory()
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 2,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = factory.create({
      initialTranscriptSeed: [
        {
          kind: 'assistant',
          content: [
            { type: 'text', text: 'answer ' },
            { type: 'image_url', image_url: { url: 'file://ignored.png', detail: 'auto' } },
            { type: 'text', text: 'done' }
          ],
          model: 'model-1',
          toolCalls: [toolCall],
          reasoning: 'think again',
          timestamp: 30
        },
        {
          kind: 'assistant',
          content: 'second',
          timestamp: 40
        }
      ],
      now: 50,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([
      {
        recordId: 'record-1',
        kind: 'assistant_step',
        timestamp: 30,
        step: {
          status: 'completed',
          stepId: 'step-1',
          stepIndex: 0,
          startedAt: 30,
          completedAt: 30,
          model: 'model-1',
          content: 'answer done',
          reasoning: 'think again',
          toolCalls: [toolCall],
          finishReason: undefined,
          usage: undefined
        }
      },
      {
        recordId: 'record-2',
        kind: 'assistant_step',
        timestamp: 40,
        step: {
          status: 'completed',
          stepId: 'step-2',
          stepIndex: 1,
          startedAt: 40,
          completedAt: 40,
          model: undefined,
          content: 'second',
          reasoning: undefined,
          toolCalls: [],
          finishReason: undefined,
          usage: undefined
        }
      }
    ])
  })

  it('matches tool results to the latest assistant step and projects content for history import', () => {
    const factory = new DefaultChatInitialTranscriptRecordFactory()
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 3,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = factory.create({
      initialTranscriptSeed: [
        {
          kind: 'assistant',
          content: 'use tool',
          toolCalls: [toolCall],
          timestamp: 10
        },
        {
          kind: 'tool',
          toolCallId: 'call-1',
          content: [
            { type: 'text', text: 'result' },
            { type: 'image_url', image_url: { url: 'file://image.png', detail: 'auto' } }
          ],
          timestamp: 12
        }
      ],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records[1]).toEqual({
      recordId: 'record-2',
      kind: 'tool_result',
      timestamp: 12,
      stepId: 'step-1',
      toolCallId: 'call-1',
      toolCallIndex: 3,
      toolName: 'read',
      status: 'success',
      content: '[{"type":"text","text":"result"},{"type":"image_url","image_url":{"url":"file://image.png","detail":"auto"}}]'
    })
  })

  it('returns empty records for empty transcript seed', () => {
    const factory = new DefaultChatInitialTranscriptRecordFactory()

    const records = factory.create({
      initialTranscriptSeed: [],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([])
  })
})
