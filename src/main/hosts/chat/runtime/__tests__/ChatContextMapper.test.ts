import { describe, expect, it } from 'vitest'
import type { LoopIdentityProvider } from '@main/agent/contracts/HostRuntimeContracts'
import { mapChatContext } from '../ChatContextMapper'

const createLoopIdentityProvider = (): LoopIdentityProvider => {
  let stepIndex = 0
  let recordIndex = 0
  let batchIndex = 0

  return {
    nextStepId: () => `step-${++stepIndex}`,
    nextTranscriptRecordId: () => `record-${++recordIndex}`,
    nextToolBatchId: () => `batch-${++batchIndex}`
  }
}

describe('mapChatContext', () => {
  it('converts user string and VLM content to transcript parts', () => {
    const records = mapChatContext({
      messages: [
        {
          role: 'user',
          segments: [],
          content: 'hello',
          createdAt: 11
        },
        {
          role: 'user',
          segments: [],
          content: [
            { type: 'text', text: 'look' },
            {
              type: 'image_url',
              image_url: { url: 'file://image.png', detail: 'high' }
            },
            {
              type: 'image_url',
              image_url: { url: 'file://auto.png', detail: undefined! }
            }
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
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 2,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = mapChatContext({
      messages: [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'answer ' },
            {
              type: 'image_url',
              image_url: { url: 'file://ignored.png', detail: 'auto' }
            },
            { type: 'text', text: 'done' }
          ],
          model: 'model-1',
          toolCalls: [toolCall],
          segments: [
            {
              type: 'reasoning',
              segmentId: 'r',
              timestamp: 0,
              content: 'think again'
            }
          ],
          createdAt: 30
        },
        {
          role: 'assistant',
          segments: [],
          content: 'second',
          createdAt: 40
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
    const toolCall: IToolCall = {
      id: 'call-1',
      index: 3,
      type: 'function',
      function: {
        name: 'read',
        arguments: '{"path":"README.md"}'
      }
    }

    const records = mapChatContext({
      messages: [
        {
          role: 'assistant',
          segments: [],
          content: 'use tool',
          toolCalls: [toolCall],
          createdAt: 10
        },
        {
          role: 'tool',
          segments: [],
          toolCallId: 'call-1',
          toolResultModelContent: 'stable projection',
          content: [
            { type: 'text', text: 'result' },
            {
              type: 'image_url',
              image_url: { url: 'file://image.png', detail: 'auto' }
            }
          ],
          createdAt: 12
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
      modelContent: 'stable projection',
      content:
        '[{"type":"text","text":"result"},{"type":"image_url","image_url":{"url":"file://image.png","detail":"auto"}}]'
    })
  })

  it('returns empty records for empty transcript seed', () => {
    const records = mapChatContext({
      messages: [],
      now: 20,
      loopIdentityProvider: createLoopIdentityProvider()
    })

    expect(records).toEqual([])
  })
})
