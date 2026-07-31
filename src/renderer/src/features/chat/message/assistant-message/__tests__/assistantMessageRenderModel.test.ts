import { describe, expect, it } from 'vitest'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import {
  mapAssistantMessage,
  type SupportRenderUnit
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
    expect(renderState.header.emotionLabel).toBe('joy')
    expect(renderState.header.emotionEmoji).toBe('🙂')
    expect(renderState.header.emotionIntensity).toBe(0.7)
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

  it('falls back to emotion tool segments when unified emotion is absent', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
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
        content: '',
        emotion: {
          label: 'excited',
          emoji: '🤩',
          intensity: 0.9,
          source: 'tool'
        },
        segments: [
          {
            ...toolCallSegment({
              id: 'preview-emotion-tool',
              name: 'emotion_report',
              toolCallId: 'preview-emotion-tool',
              transcriptVisible: false
            })
          }
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.header.emotionLabel).toBe('excited')
    expect(renderState.header.emotionEmoji).toBe('🤩')
    expect(renderState.header.emotionIntensity).toBe(0.9)
  })

  it('keeps unified emotion precedence over later tool segment derivation', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        emotion: {
          label: 'calm',
          emoji: '😌',
          intensity: 0.2,
          source: 'computed'
        },
        segments: []
      },
      previewMessage: {
        role: 'assistant',
        content: '',
        segments: [
          {
            ...toolCallSegment({
              id: 'preview-emotion-tool',
              name: 'emotion_report',
              toolCallId: 'preview-emotion-tool',
              transcriptVisible: false
            })
          }
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.header.emotionLabel).toBe('calm')
    expect(renderState.header.emotionEmoji).toBe('😌')
    expect(renderState.header.emotionIntensity).toBe(0.2)
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
          : unit.key
    ))).toEqual(['tool-1', 'reasoning-1', 'tool-2'])
  })

  it('keeps consecutive think segments as independent disclosures', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          reasoningSegment('reasoning-1', 'one'),
          reasoningSegment('reasoning-2', 'two'),
          reasoningSegment('reasoning-3', 'three')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'single',
      'single'
    ])
    expect(renderState.transcript.supportUnits.map(unit => (
      unit.type === 'single' ? unit.item.segment.segmentId : 'group'
    ))).toEqual(['reasoning-1', 'reasoning-2', 'reasoning-3'])
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
          : unit.key
    ))).toEqual(['tool-1', 'error-1', 'tool-2'])
  })

  it('groups preceding support when visible answer text begins', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: [
          reasoningSegment('reasoning-1', 'inspect'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          reasoningSegment('reasoning-2', 'compose'),
          reasoningSegment('reasoning-3', 'verify'),
          textSegment('answer-1', 'answer'),
          toolCallSegment({ id: 'tool-2', name: 'followup', toolCallId: 'tool-2' })
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'completedWork',
      'toolGroup'
    ])
    const completedWork = renderState.transcript.supportUnits[0]
    expect(completedWork).toMatchObject({
      type: 'completedWork',
      key: 'completed-work:answer-1',
      order: 0
    })
    expect(completedWork.type === 'completedWork'
      ? completedWork.units.map(unit => unit.type)
      : []
    ).toEqual(['single', 'toolGroup', 'single', 'single'])
    expect(renderState.transcript.supportUnits[1]).toMatchObject({
      type: 'toolGroup',
      order: 5
    })
  })

  it('groups a substantial support window between two content segments', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'context answer',
        segments: [
          reasoningSegment('reasoning-before-context', 'introduce'),
          textSegment('context-1', 'context'),
          reasoningSegment('reasoning-1', 'inspect'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          reasoningSegment('reasoning-2', 'compose'),
          toolCallSegment({ id: 'tool-2', name: 'search', toolCallId: 'tool-2' }),
          textSegment('answer-1', ' answer')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'completedWork'
    ])
    expect(renderState.transcript.supportUnits[1]).toMatchObject({
      type: 'completedWork',
      key: 'completed-work:answer-1',
      order: 2
    })
  })

  it('creates one completed-work disclosure for each eligible content window', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'context answer',
        segments: [
          reasoningSegment('reasoning-1', 'one'),
          reasoningSegment('reasoning-2', 'two'),
          reasoningSegment('reasoning-3', 'three'),
          reasoningSegment('reasoning-4', 'four'),
          textSegment('context-1', 'context'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          reasoningSegment('reasoning-5', 'five'),
          toolCallSegment({ id: 'tool-2', name: 'search', toolCallId: 'tool-2' }),
          reasoningSegment('reasoning-6', 'six'),
          textSegment('answer-1', ' answer')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'completedWork',
      'completedWork'
    ])
    expect(renderState.transcript.supportUnits.map(unit => unit.key)).toEqual([
      'completed-work:context-1',
      'completed-work:answer-1'
    ])
  })

  it('keeps windows with one to three support segments in their existing presentation', () => {
    const project = (segments: MessageSegment[]): SupportRenderUnit[] => (
      mapAssistantMessage({
        committedMessage: {
          role: 'assistant',
          content: 'answer',
          segments: [...segments, textSegment('answer-1', 'answer')]
        }
      }, {
        isLatest: true,
        isStreaming: false,
        providerDefinitions: [],
        accounts: []
      }).transcript.supportUnits
    )

    expect(project([
      reasoningSegment('reasoning-1', 'one')
    ]).map(unit => unit.type)).toEqual(['single'])
    expect(project([
      toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' })
    ]).map(unit => unit.type)).toEqual(['toolGroup'])
    expect(project([
      reasoningSegment('reasoning-1', 'one'),
      toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
      reasoningSegment('reasoning-2', 'two')
    ]).map(unit => unit.type)).toEqual(['single', 'toolGroup', 'single'])
  })

  it('keeps trailing support after the last visible text top-level and live', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: [
          reasoningSegment('reasoning-1', 'one'),
          reasoningSegment('reasoning-2', 'two'),
          reasoningSegment('reasoning-3', 'three'),
          reasoningSegment('reasoning-4', 'four'),
          textSegment('answer-1', 'answer'),
          reasoningSegment('reasoning-tail', 'follow up'),
          toolCallSegment({
            id: 'tool-tail',
            name: 'search',
            toolCallId: 'tool-tail',
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

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'completedWork',
      'single',
      'toolGroup'
    ])
  })

  it('lets empty text remain inside the current support window', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: [
          reasoningSegment('reasoning-1', 'one'),
          reasoningSegment('reasoning-2', 'two'),
          textSegment('empty-text', ''),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          reasoningSegment('reasoning-3', 'three'),
          textSegment('answer-1', 'answer')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    const completedWork = renderState.transcript.supportUnits[0]
    expect(completedWork.type).toBe('completedWork')
    expect(completedWork.type === 'completedWork'
      ? completedWork.units.map(unit => unit.type)
      : []
    ).toEqual(['single', 'single', 'toolGroup', 'single'])
  })

  it('applies error visibility per content window', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'context answer',
        segments: [
          reasoningSegment('reasoning-1', 'one'),
          reasoningSegment('reasoning-2', 'two'),
          errorSegment('error-1'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          reasoningSegment('reasoning-3', 'three'),
          textSegment('context-1', 'context'),
          reasoningSegment('reasoning-4', 'four'),
          reasoningSegment('reasoning-5', 'five'),
          toolCallSegment({ id: 'tool-2', name: 'search', toolCallId: 'tool-2' }),
          reasoningSegment('reasoning-6', 'six'),
          textSegment('answer-1', ' answer')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'single',
      'single',
      'toolGroup',
      'single',
      'completedWork'
    ])
    expect(renderState.transcript.supportUnits.at(-1)?.key).toBe('completed-work:answer-1')
  })

  it('keeps support top-level until a non-empty text segment arrives', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          reasoningSegment('reasoning-1', 'inspect'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          textSegment('empty-answer', '')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'toolGroup'
    ])
  })

  it('treats a leading newline as the visible answer boundary', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '\n',
        segments: [
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          toolCallSegment({ id: 'tool-2', name: 'search', toolCallId: 'tool-2' }),
          reasoningSegment('reasoning-1', 'inspect'),
          reasoningSegment('reasoning-2', 'compose'),
          textSegment('answer-1', '\n')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits[0]?.type).toBe('completedWork')
  })

  it('keeps a single preceding reasoning segment as Think', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: [
          reasoningSegment('reasoning-1', 'compose'),
          textSegment('answer-1', 'answer')
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
      type: 'single',
      order: 0
    })
  })

  it('groups four preceding reasoning segments', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: [
          reasoningSegment('reasoning-1', 'inspect'),
          reasoningSegment('reasoning-2', 'compose'),
          reasoningSegment('reasoning-3', 'verify'),
          reasoningSegment('reasoning-4', 'finish'),
          textSegment('answer-1', 'answer')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits[0]?.type).toBe('completedWork')
  })

  it('keeps support top-level when a run error precedes answer text', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'recovered',
        segments: [
          reasoningSegment('reasoning-1', 'inspect'),
          errorSegment('error-1'),
          toolCallSegment({ id: 'tool-1', name: 'read', toolCallId: 'tool-1' }),
          textSegment('answer-1', 'recovered')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: false,
      providerDefinitions: [],
      accounts: []
    })

    expect(renderState.transcript.supportUnits.map(unit => unit.type)).toEqual([
      'single',
      'single',
      'toolGroup'
    ])
  })

  it('keeps a boundary-based completed-work key stable across real preview-to-committed ids', () => {
    const previewSegments: MessageSegment[] = [
      reasoningSegment('preview:step-1:reasoning:0', 'inspect'),
      toolCallSegment({
        id: 'preview:step-1:tool:0',
        name: 'read',
        toolCallId: 'tool-1'
      }),
      reasoningSegment('preview:step-1:reasoning:1', 'compose'),
      reasoningSegment('preview:step-1:reasoning:2', 'verify'),
      textSegment('preview:step-1:text:0', 'answer')
    ]
    const committedSegments: MessageSegment[] = [
      reasoningSegment('committed:step-1:reasoning:0', 'inspect'),
      toolCallSegment({
        id: 'committed:step-1:tool:0',
        name: 'read',
        toolCallId: 'tool-1'
      }),
      reasoningSegment('committed:step-1:reasoning:1', 'compose'),
      reasoningSegment('committed:step-1:reasoning:2', 'verify'),
      textSegment('committed:step-1:text:0', 'answer')
    ]
    const context = {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    }
    const previewState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: []
      },
      previewMessage: {
        role: 'assistant',
        content: 'answer',
        segments: previewSegments
      }
    }, context)
    const committedState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: 'answer',
        segments: committedSegments
      }
    }, {
      ...context,
      isStreaming: false
    })

    expect(previewState.transcript.supportUnits[0]?.key)
      .toBe(committedState.transcript.supportUnits[0]?.key)
    expect(previewState.transcript.supportUnits[0]?.key)
      .toBe('completed-work:step-1:text:0')
  })

  it('groups committed support with a recovered failed preview tool call', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        segments: [
          reasoningSegment('reasoning-1', 'inspect'),
          reasoningSegment('reasoning-2', 'compose'),
          reasoningSegment('reasoning-3', 'verify')
        ]
      },
      previewMessage: {
        role: 'assistant',
        content: 'recovered',
        segments: [
          toolCallSegment({
            id: 'failed-tool',
            name: 'read',
            toolCallId: 'failed-tool',
            status: 'failed'
          }),
          textSegment('answer-1', 'recovered')
        ]
      }
    }, {
      isLatest: true,
      isStreaming: true,
      providerDefinitions: [],
      accounts: []
    })

    const completedWork = renderState.transcript.supportUnits[0]
    expect(completedWork.type).toBe('completedWork')
    expect(completedWork.type === 'completedWork'
      ? completedWork.units.map(unit => unit.type)
      : []
    ).toEqual(['single', 'single', 'single', 'toolGroup'])
    expect(completedWork.type === 'completedWork'
      && completedWork.units[3]?.type === 'toolGroup'
      ? completedWork.units[3].items[0].segment
      : undefined
    ).toMatchObject({
      type: 'toolCall',
      content: {
        status: 'failed'
      }
    })
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
      modelProvider: undefined,
      emotionLabel: undefined,
      emotionEmoji: undefined,
      emotionIntensity: undefined
    })
    expect(renderState.transcript.supportItems).toHaveLength(3)
    expect(renderState.transcript.supportItems.map(item => item.segment.type)).toEqual([
      'toolCall',
      'toolCall',
      'toolCall'
    ])
  })
})
