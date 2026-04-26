import { describe, expect, it } from 'vitest'
import { mapAssistantMessage } from '../model/assistantMessageMapper'

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

const toolCallSegment = (args: {
  id: string
  name: string
  toolCallId: string
  timestamp?: number
  transcriptVisible?: boolean
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
    status: 'completed'
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

  it('keeps unified emotion precedence over later tool segment fallbacks', () => {
    const renderState = mapAssistantMessage({
      committedMessage: {
        role: 'assistant',
        content: '',
        emotion: {
          label: 'calm',
          emoji: '😌',
          intensity: 0.2,
          source: 'fallback'
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
})
