import { describe, expect, it } from 'vitest'
import {
  EMOTION_BASELINE_VECTOR,
  projectEmotionVector,
  type EmotionStimulus,
  type EmotionVector
} from '@shared/emotion/emotionVector'
import {
  extractEmotionToolStateFromSegments,
  transitionEmotionState
} from '../emotion-state'

const createState = (
  vector: EmotionVector = EMOTION_BASELINE_VECTOR,
  history: EmotionStateHistoryEntry[] = []
): EmotionStateSnapshot => {
  const projection = projectEmotionVector(vector)
  return {
    current: {
      vector: { ...vector },
      label: projection.label,
      intensity: projection.intensity,
      updatedAt: 100
    },
    baseline: { ...EMOTION_BASELINE_VECTOR },
    history
  }
}

const report = (stimulus: EmotionStimulus) => ({ stimulus })

const toolMessage = (stimulus: EmotionStimulus, success = true) => ({
  role: 'assistant',
  segments: [{
    type: 'toolCall',
    name: 'emotion_report',
    content: {
      toolName: 'emotion_report',
      result: { success, stimulus }
    }
  }]
}) as unknown as ChatMessage

describe('emotion-state helpers', () => {
  it('extracts a normalized stimulus for reducer-owned state calculation', () => {
    const stimulus = { impact: -1, activation: 1, control: 0 }

    expect(extractEmotionToolStateFromSegments(toolMessage(stimulus))).toEqual({ stimulus })
  })

  it('ignores failed and malformed emotion_report segments', () => {
    expect(extractEmotionToolStateFromSegments(toolMessage({
      impact: 1,
      activation: 0,
      control: 0
    }, false))).toBeUndefined()
    expect(extractEmotionToolStateFromSegments({
      role: 'assistant',
      segments: [{
        type: 'toolCall',
        name: 'emotion_report',
        content: {
          toolName: 'emotion_report',
          result: { success: true, stimulus: { impact: 3, activation: 0, control: 0 } }
        }
      }]
    } as unknown as ChatMessage)).toBeUndefined()
  })

  it('creates a neutral computed baseline on the first turn without a report', () => {
    const result = transitionEmotionState({ now: 200 })

    expect(result.changed).toBe(true)
    expect(result.presentation).toEqual({
      label: 'neutral',
      emoji: '😐',
      intensity: 5,
      source: 'computed'
    })
    expect(result.state.current).toEqual({
      vector: { valence: 5, arousal: 3, dominance: 5 },
      label: 'neutral',
      intensity: 5,
      updatedAt: 200
    })
    expect(result.state.baseline).toEqual(EMOTION_BASELINE_VECTOR)
    expect(result.state.history).toEqual([])
    expect(result.diagnostics).toEqual({
      mode: 'initialized',
      resolved: {
        label: 'neutral',
        intensity: 5,
        vector: { valence: 5, arousal: 3, dominance: 5 }
      },
      historyAction: 'initialized'
    })
  })

  it('returns an omitted turn toward the fixed baseline', () => {
    const previous = createState({ valence: 1, arousal: 7, dominance: 8 })
    const result = transitionEmotionState({ previous, now: 200 })

    expect(result.diagnostics.mode).toBe('decayed')
    expect(result.state.current.vector).toMatchObject({
      valence: expect.closeTo(1.8),
      arousal: 5,
      dominance: 7.1
    })
    expect(result.state.current.vector.valence).toBeGreaterThan(previous.current.vector.valence)
    expect(result.state.current.vector.arousal).toBeLessThan(previous.current.vector.arousal)
    expect(result.state.history.at(-1)).toMatchObject({
      source: 'computed',
      stimulus: { impact: 0, activation: 0, control: 0 }
    })
  })

  it('keeps an already neutral omitted turn unchanged', () => {
    const previous = createState()
    const result = transitionEmotionState({ previous, now: 200 })

    expect(result.changed).toBe(false)
    expect(result.state).toEqual(previous)
    expect(result.diagnostics).toMatchObject({
      mode: 'decayed',
      historyAction: 'unchanged'
    })
  })

  it('accumulates repeated hostile behavior into a negative emotion', () => {
    let state: EmotionStateSnapshot | undefined
    const valences: number[] = []

    for (let index = 0; index < 3; index += 1) {
      const result = transitionEmotionState({
        previous: state,
        reported: report({ impact: -2, activation: 0, control: -1 }),
        now: 200 + index
      })
      state = result.state
      valences.push(result.state.current.vector.valence)
    }

    expect(valences).toEqual([3, 1.4, expect.closeTo(0.12)])
    expect(state?.current.label).not.toBe('neutral')
    expect(state?.current.intensity).toBeGreaterThan(5)
    expect(state?.history).toHaveLength(3)
    expect(state?.history.every(entry => entry.source === 'tool')).toBe(true)
  })

  it('raises arousal for a respectful urgent request while keeping valence positive', () => {
    const result = transitionEmotionState({
      previous: createState(),
      reported: report({ impact: 1, activation: 2, control: 1 }),
      now: 200
    })

    expect(result.state.current.vector).toEqual({
      valence: 6,
      arousal: 5,
      dominance: 6
    })
    expect(result.state.current.vector.arousal).toBeGreaterThan(3)
    expect(result.state.current.vector.valence).toBeGreaterThanOrEqual(5)
    expect(['happiness', 'love', 'surprise', 'desire']).toContain(result.presentation.label)
    expect(result.presentation.source).toBe('computed')
  })

  it.each([
    {
      scenario: 'plain hostility',
      stimulus: { impact: -2, activation: 0, control: 0 },
      expected: 'sadness'
    },
    {
      scenario: 'activated hostility with control',
      stimulus: { impact: -2, activation: 2, control: 2 },
      expected: 'disgust'
    },
    {
      scenario: 'destabilizing ambiguity',
      stimulus: { impact: 0, activation: 1, control: -2 },
      expected: 'confusion'
    },
    {
      scenario: 'calm support',
      stimulus: { impact: 2, activation: -1, control: 1 },
      expected: 'love'
    }
  ])('projects $scenario into its expected semantic family', ({ stimulus, expected }) => {
    const result = transitionEmotionState({
      previous: createState(),
      reported: report(stimulus),
      now: 200
    })

    expect(result.presentation.label).toBe(expected)
  })

  it('repairs a negative state gradually after apology and support', () => {
    const hostile = transitionEmotionState({
      previous: createState(),
      reported: report({ impact: -2, activation: 1, control: -1 }),
      now: 200
    }).state
    const moreHostile = transitionEmotionState({
      previous: hostile,
      reported: report({ impact: -2, activation: 1, control: -1 }),
      now: 201
    }).state
    const repaired = transitionEmotionState({
      previous: moreHostile,
      reported: report({ impact: 2, activation: -1, control: 1 }),
      now: 202
    })

    expect(repaired.state.current.vector.valence).toBeGreaterThan(moreHostile.current.vector.valence)
    expect(repaired.state.current.vector.arousal).toBeLessThan(moreHostile.current.vector.arousal)
    expect(repaired.state.current.vector.valence).toBeLessThanOrEqual(5)
  })

  it('bounds history to ten applied transitions', () => {
    let state: EmotionStateSnapshot | undefined
    for (let index = 0; index < 12; index += 1) {
      state = transitionEmotionState({
        previous: state,
        reported: report({ impact: 0, activation: 0, control: 0 }),
        now: 200 + index
      }).state
    }

    expect(state?.history).toHaveLength(10)
    expect(state?.history[0].timestamp).toBe(202)
  })
})
