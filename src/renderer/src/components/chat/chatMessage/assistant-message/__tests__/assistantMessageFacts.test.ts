import { describe, expect, it } from 'vitest'
import { buildAssistantMessageFacts } from '../model/assistantMessageFacts'

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
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

describe('buildAssistantMessageFacts', () => {
  it('filters emotion-only tool segments from transcript facts', () => {
    const facts = buildAssistantMessageFacts({
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        segments: [
          textSegment('text-1', 'hello'),
          toolCallSegment({
            id: 'emotion-tool',
            name: 'emotion_report',
            toolCallId: 'emotion-tool',
            transcriptVisible: false
          })
        ]
      }
    })

    expect(facts.transcript.committedSegments.map(segment => segment.segmentId)).toEqual(['text-1'])
  })

  it('prefers preview unified emotion from host-provided message semantics', () => {
    const facts = buildAssistantMessageFacts({
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
        emotion: {
          label: 'excited',
          emoji: '🤩',
          intensity: 0.9,
          source: 'tool'
        },
        segments: [
          toolCallSegment({
            id: 'emotion-tool',
            name: 'emotion_report',
            toolCallId: 'emotion-tool',
            transcriptVisible: false
          })
        ]
      }
    })

    expect(facts.emotion).toEqual({
      label: 'excited',
      emoji: '🤩',
      intensity: 0.9
    })
  })

  it('keeps only visible tool calls in presence facts', () => {
    const facts = buildAssistantMessageFacts({
      committedMessage: {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'emotion-tool',
            index: 0,
            type: 'function',
            function: {
              name: 'emotion_report',
              arguments: '{}'
            }
          }
        ],
        segments: []
      },
      previewMessage: {
        role: 'assistant',
        content: '',
        segments: [
          toolCallSegment({
            id: 'real-tool',
            name: 'read_file',
            toolCallId: 'real-tool'
          })
        ],
        toolCalls: []
      }
    })

    expect(facts.presence.hasToolCalls).toBe(true)
    expect(facts.isOverlayPreview).toBe(true)
  })
})
