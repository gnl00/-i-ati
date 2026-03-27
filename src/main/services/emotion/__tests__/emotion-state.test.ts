import { describe, expect, it } from 'vitest'
import {
  buildFallbackEmotionState,
  buildNextEmotionStateSnapshot,
  extractEmotionFromToolSegments,
  extractEmotionToolStateFromSegments
} from '../emotion-state'

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
              emoji: '😏'
            }
          },
          timestamp: Date.now()
        }
      ]
    } as unknown as ChatMessage

    expect(extractEmotionFromToolSegments(message)).toBeUndefined()
  })

  it('extracts accumulated residue from a successful emotion_report tool segment', () => {
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
              label: 'fear',
              emoji: '😟',
              accumulated: [
                {
                  label: 'fear',
                  description: 'Worry about slow job progress',
                  intensity: 3,
                  decay: 0.95
                }
              ]
            }
          },
          timestamp: Date.now()
        }
      ]
    } as unknown as ChatMessage

    expect(extractEmotionToolStateFromSegments(message)).toMatchObject({
      emotion: {
        label: 'fear',
        emoji: '😟',
        source: 'tool'
      },
      accumulated: [
        {
          label: 'fear',
          description: 'Worry about slow job progress',
          intensity: 3,
          decay: 0.95
        }
      ]
    })
  })

  it('builds fallback current emotion when the tool is missing', () => {
    expect(buildFallbackEmotionState('happiness', 0.91)).toMatchObject({
      label: 'happiness',
      emoji: '🤣',
      intensity: 9,
      source: 'fallback'
    })
    expect(buildFallbackEmotionState('fear', 0.6)).toMatchObject({
      label: 'fear',
      emoji: '😨',
      intensity: 6,
      source: 'fallback'
    })
    expect(buildFallbackEmotionState('unknown-label', 0.2)).toMatchObject({
      label: 'neutral',
      emoji: '😶',
      intensity: 3,
      source: 'fallback'
    })
  })

  it('builds an initial structured emotion snapshot from a tool emotion payload', () => {
    const next = buildNextEmotionStateSnapshot(undefined, {
      label: 'surprise',
      emoji: '😯',
      source: 'tool',
      intensity: 6
    }, {
      now: 123456,
      accumulated: [
        {
          label: 'surprise',
          description: 'Still startled by the previous turn',
          intensity: 2,
          decay: 0.95,
          updatedAt: 100
        }
      ]
    })

    expect(next).toEqual({
      current: {
        label: 'surprise',
        intensity: 6,
        updatedAt: 123456
      },
      background: {
        label: 'surprise',
        intensity: 6,
        driftFactor: 0.1,
        updatedAt: 123456
      },
      accumulated: [
        {
          label: 'surprise',
          description: 'Still startled by the previous turn',
          intensity: 2,
          decay: 0.95,
          updatedAt: 123456
        }
      ],
      history: [
        {
          label: 'surprise',
          intensity: 6,
          timestamp: 123456,
          source: 'tool'
        }
      ]
    })
  })

  it('preserves background and appends history on subsequent snapshots', () => {
    const previous: EmotionStateSnapshot = {
      current: {
        label: 'neutral',
        intensity: 5,
        updatedAt: 100
      },
      background: {
        label: 'neutral',
        intensity: 5,
        driftFactor: 0.1,
        updatedAt: 100
      },
      accumulated: [
        {
          label: 'fear',
          description: 'Repeated concern about the same issue',
          intensity: 2,
          decay: 0.95,
          updatedAt: 100
        }
      ],
      history: [
        {
          label: 'neutral',
          intensity: 5,
          timestamp: 100,
          source: 'tool'
        }
      ]
    }

    const next = buildNextEmotionStateSnapshot(previous, {
      label: 'happiness',
      emoji: '😊',
      source: 'tool',
      intensity: 7
    }, {
      now: 200,
      accumulated: [
        {
          label: 'happiness',
          description: 'Lingering warmth after a positive exchange',
          intensity: 3,
          decay: 0.97,
          updatedAt: 150
        }
      ]
    })

    expect(next.current).toEqual({
      label: 'happiness',
      intensity: 7,
      updatedAt: 200
    })
    expect(next.background).toEqual({
      label: 'neutral',
      intensity: 5,
      driftFactor: 0.1,
      updatedAt: 200
    })
    expect(next.accumulated).toEqual([
      {
        label: 'happiness',
        description: 'Lingering warmth after a positive exchange',
        intensity: 3,
        decay: 0.97,
        updatedAt: 200
      }
    ])
    expect(next.history).toEqual([
      {
        label: 'neutral',
        intensity: 5,
        timestamp: 100,
        source: 'tool'
      },
      {
        label: 'happiness',
        intensity: 7,
        timestamp: 200,
        source: 'tool'
      }
    ])
  })

  it('decays previous accumulated residue when tool does not provide a rewritten list', () => {
    const previous: EmotionStateSnapshot = {
      current: {
        label: 'concern',
        intensity: 6,
        updatedAt: 100
      },
      background: {
        label: 'neutral',
        intensity: 5,
        driftFactor: 0.1,
        updatedAt: 100
      },
      accumulated: [
        {
          label: 'fear',
          description: 'Worry about slow job progress',
          intensity: 4,
          decay: 0.95,
          updatedAt: 100
        }
      ],
      history: []
    }

    const next = buildNextEmotionStateSnapshot(previous, {
      label: 'confusion',
      emoji: '🤔',
      source: 'tool',
      intensity: 6
    }, { now: 300 })

    expect(next.accumulated).toEqual([
      {
        label: 'fear',
        description: 'Worry about slow job progress',
        intensity: 3.8,
        decay: 0.95,
        updatedAt: 300
      }
    ])
  })
})
