import { describe, expect, it } from 'vitest'
import { buildFallbackEmotionState, extractEmotionFromToolSegments } from '../emotion-state'

describe('emotion-state helpers', () => {
  it('extracts unified emotion state from successful emotion_report tool segment', () => {
    const message = {
      role: 'assistant',
      content: 'hello',
      segments: [
        {
          type: 'toolCall',
          name: 'emotion_report',
          content: {
            toolName: 'emotion_report',
            result: {
              success: true,
              label: 'sarcasm',
              stateText: 'playful',
              emojiName: 'Smirking Face',
              emoji: '😏',
              intensity: 7,
              reason: 'Teasing in a light tone'
            }
          },
          timestamp: Date.now()
        }
      ]
    } as unknown as ChatMessage

    expect(extractEmotionFromToolSegments(message)).toEqual({
      label: 'sarcasm',
      emoji: '😏',
      emojiName: 'Smirking Face',
      stateText: 'playful',
      intensity: 7,
      reason: 'Teasing in a light tone',
      source: 'tool'
    })
  })

  it('ignores failed emotion_report tool segments', () => {
    const message = {
      role: 'assistant',
      content: 'hello',
      segments: [
        {
          type: 'toolCall',
          name: 'emotion_report',
          content: {
            toolName: 'emotion_report',
            result: {
              success: false,
              label: 'sarcasm',
              emojiName: 'Smirking Face',
              emoji: '😏'
            }
          },
          timestamp: Date.now()
        }
      ]
    } as unknown as ChatMessage

    expect(extractEmotionFromToolSegments(message)).toBeUndefined()
  })

  it('picks different fallback assets based on label and score', () => {
    expect(buildFallbackEmotionState('happiness', 0.91)).toMatchObject({
      label: 'happiness',
      emojiName: 'Rolling On The Floor Laughing',
      emoji: '🤣',
      source: 'fallback'
    })
    expect(buildFallbackEmotionState('fear', 0.6)).toMatchObject({
      label: 'fear',
      emojiName: 'Fearful Face',
      emoji: '😨',
      source: 'fallback'
    })
    expect(buildFallbackEmotionState('unknown-label', 0.2)).toMatchObject({
      label: 'neutral',
      emojiName: 'Face Without Mouth',
      emoji: '😶',
      source: 'fallback'
    })
  })
})
