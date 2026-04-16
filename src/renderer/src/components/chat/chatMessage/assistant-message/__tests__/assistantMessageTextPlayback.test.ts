import { describe, expect, it } from 'vitest'
import { buildAssistantMessageTextPlaybackModel } from '../model/assistantMessageTextPlayback'
import type { TextSegmentRenderItem } from '../model/assistantMessageMapper'

const textSegment = (id: string, content: string, timestamp = 1): TextSegment => ({
  type: 'text',
  segmentId: id,
  content,
  timestamp
})

function createTextItem(
  layer: TextSegmentRenderItem['layer'],
  sourceIndex: number,
  order: number,
  segment: TextSegment
): TextSegmentRenderItem {
  return {
    key: `${layer}-${segment.segmentId}`,
    layer,
    sourceIndex,
    order,
    segment
  }
}

describe('buildAssistantMessageTextPlaybackModel', () => {
  it('splits committed and preview text segments for typewriter playback', () => {
    const playback = buildAssistantMessageTextPlaybackModel({
      committedMessage: {
        role: 'assistant',
        content: 'hello',
        typewriterCompleted: true
      },
      previewMessage: {
        role: 'assistant',
        content: 'hello world',
        source: 'stream_preview',
        typewriterCompleted: false
      }
    }, [
      createTextItem('committed', 0, 0, textSegment('committed-text', 'hello')),
      createTextItem('preview', 0, 1, textSegment('preview-text', ' world'))
    ])

    expect(playback.committed.segments.map((segment) => segment.segmentId)).toEqual(['committed-text'])
    expect(playback.preview.segments.map((segment) => segment.segmentId)).toEqual(['preview-text'])
    expect(playback.committed.typewriterCompleted).toBe(true)
    expect(playback.preview.source).toBe('stream_preview')
  })
})
