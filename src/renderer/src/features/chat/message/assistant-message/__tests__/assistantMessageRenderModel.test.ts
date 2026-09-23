import { describe, expect, it } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import {
  mapAssistantMessage
} from '../model/assistantMessageMapper'

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
  segmentId: id,
  content,
  timestamp
})

const reasoningSegment = (id: string, content: string, timestamp = 2): ReasoningSegment => ({
  type: 'reasoning',
  segmentId: id,
  content,
  timestamp
})

const errorSegment = (id: string, timestamp = 4): ErrorSegment => ({
  type: 'error',
  segmentId: id,
  content: 'failed',
  error: {
    name: 'ToolError',
    message: 'Tool failed',
    timestamp
  }
})

const toolCallSegment = (args: {
  id: string
  name: string
  toolCallId: string
  timestamp?: number
  transcriptVisible?: boolean
  reason?: string
  status?: string
  result?: unknown
}): ToolCallSegment => ({
  type: 'toolCall',
  segmentId: args.id,
  name: args.name,
  toolCallId: args.toolCallId,
  toolCallIndex: 0,
  isError: false,
  timestamp: args.timestamp ?? 3,
  content: {
    toolName: args.name,
    status: args.status ?? 'completed',
    ...(args.reason
      ? {
          args: JSON.stringify({
            [TOOL_CALL_REASON_PARAMETER_NAME]: args.reason
          })
        }
      : {}),
    ...(args.result !== undefined ? { result: args.result } : {})
  },
  ...(args.transcriptVisible === false
    ? {
        presentation: {
          transcriptVisible: false
        }
      }
    : {})
})

describe('mapAssistantMessage', () => {
  it('projects committed and preview segments into ordered text/support lanes', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        model: 'gpt-5',
        modelRef: {
          accountId: 'acct-1',
          modelId: 'gpt-5'
        },
        content: 'hello',
        segments: [
          textSegment('committed-text', 'hello'),
          toolCallSegment({
            id: 'emotion-tool',
            name: 'emotion_report',
            toolCallId: 'emotion-tool',
            transcriptVisible: false
          })
        ]
      },
      previewMessage: {
        role: 'assistant',
        model: 'gpt-5-preview',
        modelRef: {
          accountId: 'acct-1',
          modelId: 'gpt-5-preview'
        },
        content: 'hello world',
        emotion: {
          label: 'joy',
          emoji: '🙂',
          intensity: 0.7,
          source: 'tool'
        },
        segments: [
          reasoningSegment('preview-reasoning', 'thinking'),
          textSegment('preview-text', ' world')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [
        {
          id: 'openai',
          iconKey: 'openai'
        } as ProviderDefinition
      ],
      accounts: [
        {
          id: 'acct-1',
          providerId: 'openai'
        } as ProviderAccount
      ]
    })

    expect(renderState.transcript.isOverlayPreview).toBe(true)
    expect(renderState.transcript.textItems.map(item => item.segment.segmentId)).toEqual([
      'committed-text',
      'preview-text'
    ])
    expect(renderState.transcript.textItems.map(item => ({
      id: item.segment.segmentId,
      sourceIndex: item.sourceIndex
    }))).toEqual([
      { id: 'committed-text', sourceIndex: 0 },
      { id: 'preview-text', sourceIndex: 1 }
    ])
    expect(renderState.transcript.supportItems.map(item => item.segment.segmentId)).toEqual([
      'preview-reasoning'
    ])
    expect(renderState.header.badgeModel).toBe('gpt-5-preview')
    expect(renderState.header.modelProvider).toBe('openai')
  })

  it('does not expose emotion-only tool calls as visible tool calls', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tool-1',
            index: 0,
            type: 'function',
            function: {
              name: 'emotion_report',
              arguments: '{}'
            }
          }
        ],
        segments: []
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.textItems).toHaveLength(0)
    expect(renderState.transcript.supportItems).toHaveLength(0)
  })

  it('marks only the preview tail support item as streaming', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'committed',
        segments: [
          textSegment('committed-text', 'committed')
        ]
      },
      previewMessage: {
        role: 'assistant',
        content: '',
        segments: [
          reasoningSegment('preview-reasoning-1', 'one'),
          reasoningSegment('preview-reasoning-2', 'two')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportItems.map(item => ({
      id: item.segment.segmentId,
      isStreamingTail: item.isStreamingTail
    }))).toEqual([
      { id: 'preview-reasoning-1', isStreamingTail: false },
      { id: 'preview-reasoning-2', isStreamingTail: true }
    ])
    expect(renderState.transcript.supportUnits).toHaveLength(1)
    expect(renderState.transcript.supportUnits[0]).toMatchObject({
      type: 'single',
      item: {
        isStreamingTail: true,
        segment: {
          segmentId: 'preview-reasoning-1',
          content: 'one\n\ntwo'
        }
      }
    })
  })

  it('groups consecutive tool calls into one support render unit', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'tool-1',
            name: 'read',
            toolCallId: 'tool-1'
          }),
          toolCallSegment({
            id: 'tool-2',
            name: 'search',
            toolCallId: 'tool-2'
          }),
          toolCallSegment({
            id: 'tool-3',
            name: 'shell',
            toolCallId: 'tool-3'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits).toHaveLength(1)
    expect(renderState.transcript.supportUnits[0]).toMatchObject({
      type: 'toolGroup',
      order: 0
    })
    expect(renderState.transcript.supportUnits[0].type === 'toolGroup'
      ? renderState.transcript.supportUnits[0].items.map(item => item.segment.segmentId)
      : []
    ).toEqual(['tool-1', 'tool-2', 'tool-3'])
  })

  it('wraps latest streaming singleton support items in a stable support group', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: []
      },
      previewMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'streaming-tool',
            name: 'read',
            toolCallId: 'streaming-tool',
            status: 'running'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits).toHaveLength(1)
    expect(renderState.transcript.supportUnits[0]).toMatchObject({
      type: 'toolGroup',
      key: 'tool-group:preview-streaming-tool-0',
      order: 0
    })
    expect(renderState.transcript.supportUnits[0].type === 'toolGroup'
      ? renderState.transcript.supportUnits[0].items.map(item => item.segment.segmentId)
      : []
    ).toEqual(['streaming-tool'])
  })

  it('wraps settled singleton tool calls in the shared tool list', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'settled-tool',
            name: 'read',
            toolCallId: 'settled-tool'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits).toHaveLength(1)
    expect(renderState.transcript.supportUnits[0]).toMatchObject({
      type: 'toolGroup',
      key: 'tool-group:committed-settled-tool-0',
      order: 0
    })
  })

  it('keeps think independent from adjacent tool calls', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'tool-1',
            name: 'read',
            toolCallId: 'tool-1'
          }),
          reasoningSegment('reasoning-1', 'thinking'),
          toolCallSegment({
            id: 'tool-2',
            name: 'search',
            toolCallId: 'tool-2'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'toolGroup',
      'single',
      'toolGroup'
    ])
    expect(renderState.transcript.supportUnits.map(unit => (
      unit.type === 'single'
        ? unit.item.segment.segmentId
        : unit.type === 'toolGroup'
          ? unit.items[0]?.segment.segmentId
          : undefined
    ))).toEqual(['tool-1', 'reasoning-1', 'tool-2'])
  })

  it('merges consecutive think segments into the first disclosure as new paragraphs', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          { ...reasoningSegment('reasoning-1', 'one', 1), endedAt: 2 },
          { ...reasoningSegment('reasoning-2', 'two', 3), endedAt: 4 },
          { ...reasoningSegment('reasoning-3', 'three', 5), endedAt: 6 }
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportItems).toHaveLength(3)
    expect(renderState.transcript.supportUnits).toHaveLength(1)
    expect(renderState.transcript.supportUnits[0]).toMatchObject({
      type: 'single',
      item: {
        key: 'committed-reasoning-1-0',
        isStreamingTail: false,
        segment: {
          segmentId: 'reasoning-1',
          content: 'one\n\ntwo\n\nthree',
          timestamp: 1,
          endedAt: 6
        }
      }
    })
  })

  it('keeps the answer boundary as a tool-list boundary below the disclosure threshold', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'middle',
        segments: [
          toolCallSegment({
            id: 'tool-1',
            name: 'read',
            toolCallId: 'tool-1'
          }),
          textSegment('text-1', 'middle'),
          toolCallSegment({
            id: 'tool-2',
            name: 'search',
            toolCallId: 'tool-2'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportItems.map(item => item.order)).toEqual([0, 2])
    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'toolGroup',
      'toolGroup'
    ])
  })

  it('keeps layer changes as tool list boundaries during streaming', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'committed-tool',
            name: 'read',
            toolCallId: 'committed-tool'
          })
        ]
      },
      previewMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'preview-tool',
            name: 'search',
            toolCallId: 'preview-tool'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportItems.map(item => ({
      id: item.segment.segmentId,
      layer: item.layer,
      order: item.order
    }))).toEqual([
      { id: 'committed-tool', layer: 'committed', order: 0 },
      { id: 'preview-tool', layer: 'preview', order: 1 }
    ])
    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual(['toolGroup', 'toolGroup'])
    expect(renderState.transcript.supportUnits.map(unit => (
      unit.type === 'toolGroup' ? unit.items.map(item => item.segment.segmentId) : []
    ))).toEqual([
      ['committed-tool'],
      ['preview-tool']
    ])
  })

  it('keeps errors as tool list boundaries', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'tool-1',
            name: 'read',
            toolCallId: 'tool-1'
          }),
          errorSegment('error-1'),
          toolCallSegment({
            id: 'tool-2',
            name: 'search',
            toolCallId: 'tool-2'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'toolGroup',
      'single',
      'toolGroup'
    ])
    expect(renderState.transcript.supportUnits.map(unit => (
      unit.type === 'single'
        ? unit.item.segment.segmentId
        : unit.type === 'toolGroup'
          ? unit.items[0]?.segment.segmentId
          : undefined
    ))).toEqual(['tool-1', 'error-1', 'tool-2'])
  })

  it('keeps support leaves unchanged when intermediate or final text appears', () => {
    const segments = [reasoningSegment('thought', 'Inspect'), toolCallSegment({ id: 'tool', name: 'read', toolCallId: 'tool' })]
    const context = { isLatest: true, isStreaming: true, providerDefinitions: [], accounts: [] }
    const before = mapAssistantMessage({ committedMessage: { role: 'assistant', content: '', segments } }, context)
    const after = mapAssistantMessage({ committedMessage: { role: 'assistant', content: 'Answer', segments: [...segments, textSegment('answer', 'Answer')] } }, context)
    expect(after.transcript.supportUnits).toEqual(before.transcript.supportUnits)
    expect(after.transcript.supportUnits.map(unit => unit.type)).toEqual(['single', 'toolGroup'])
  })

  it('keeps tool call reason data on support items while projecting a lean header', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        model: 'gpt-5',
        content: '',
        segments: [
          toolCallSegment({
            id: 'tool-1',
            name: 'read',
            toolCallId: 'tool-1',
            reason: 'Read first.',
            status: 'success',
            result: { ok: true }
          }),
          toolCallSegment({
            id: 'tool-2',
            name: 'search',
            toolCallId: 'tool-2',
            reason: 'Search second.',
            status: 'running'
          }),
          toolCallSegment({
            id: 'tool-3',
            name: 'shell',
            toolCallId: 'tool-3',
            reason: 'Typecheck last.',
            status: 'pending'
          })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.header).toEqual({
      badgeModel: 'gpt-5',
      modelProvider: undefined
    })
    expect(renderState.transcript.supportItems).toHaveLength(3)
    expect(renderState.transcript.supportItems.map(item => item.segment.type)).toEqual([
      'toolCall',
      'toolCall',
      'toolCall'
    ])
  })
})
