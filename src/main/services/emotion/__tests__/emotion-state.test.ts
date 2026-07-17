import { describe, expect, it } from 'vitest'
import {
  extractEmotionFromToolSegments,
  extractEmotionToolStateFromSegments,
  transitionEmotionState
} from '../emotion-state'

const createState = (
  currentLabel = 'neutral',
  currentIntensity = 5,
  history: EmotionStateHistoryEntry[] = [],
  accumulated: EmotionAccumulatedEntry[] = []
): EmotionStateSnapshot => ({
  current: { label: currentLabel, intensity: currentIntensity, updatedAt: 100 },
  background: { label: 'neutral', intensity: 5, driftFactor: 0.1, updatedAt: 100 },
  accumulated,
  history
})

const report = (
  label: string,
  intensity: number,
  accumulated?: EmotionAccumulatedEntry[]
) => ({
  emotion: {
    label,
    emoji: '🙂',
    intensity,
    source: 'tool' as const
  },
  ...(accumulated ? { accumulated } : {})
})

describe('emotion-state helpers', () => {
  it('extracts emotion and accumulated residue from a successful tool segment', () => {
    const message = {
      role: 'assistant',
      segments: [{
        type: 'toolCall',
        name: 'emotion_report',
        content: {
          toolName: 'emotion_report',
          result: {
            success: true,
            label: 'fear',
            stateText: 'uneasy',
            intensity: 7,
            reason: 'Slow progress',
            accumulated: [{
              label: 'fear',
              intensity: 3,
              decay: 0.95
            }]
          }
        }
      }]
    } as unknown as ChatMessage

    expect(extractEmotionFromToolSegments(message)).toMatchObject({
      label: 'fear',
      stateText: 'uneasy',
      intensity: 7,
      reason: 'Slow progress',
      source: 'tool'
    })
    expect(extractEmotionToolStateFromSegments(message)?.accumulated).toMatchObject([{
      label: 'fear',
      intensity: 3,
      decay: 0.95
    }])
  })

  it('ignores failed emotion_report tool segments', () => {
    const message = {
      role: 'assistant',
      segments: [{
        type: 'toolCall',
        name: 'emotion_report',
        content: {
          toolName: 'emotion_report',
          result: { success: false, label: 'fear' }
        }
      }]
    } as unknown as ChatMessage

    expect(extractEmotionFromToolSegments(message)).toBeUndefined()
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
      label: 'neutral',
      intensity: 5,
      updatedAt: 200
    })
    expect(result.state.history).toEqual([])
    expect(result.diagnostics).toEqual({
      mode: 'initialized',
      resolved: { label: 'neutral', intensity: 5 },
      intensityBounded: false,
      backgroundAction: 'initialized',
      accumulatedAction: 'empty',
      evictedCount: 0
    })
  })

  it('carries previous current forward without adding history when the tool is omitted', () => {
    const previous = createState('happiness', 7, [{
      label: 'happiness',
      intensity: 7,
      timestamp: 100,
      source: 'tool'
    }])
    const result = transitionEmotionState({ previous, now: 200 })

    expect(result.changed).toBe(false)
    expect(result.state).toEqual(previous)
    expect(result.presentation).toMatchObject({
      label: 'happiness',
      intensity: 7,
      source: 'computed'
    })
    expect(result.diagnostics.mode).toBe('carried_forward')
    expect(result.diagnostics.backgroundAction).toBe('held')
  })

  it.each([
    [9, 7],
    [1, 3]
  ])('bounds reported intensity %s to %s from a previous intensity of 5', (reported, expected) => {
    const result = transitionEmotionState({
      previous: createState(),
      reported: report('surprise', reported),
      now: 200
    })

    expect(result.state.current.intensity).toBe(expected)
    expect(result.presentation.intensity).toBe(expected)
    expect(result.diagnostics.intensityBounded).toBe(true)
  })

  it('promotes a new background label after three consecutive successful reports', () => {
    const history: EmotionStateHistoryEntry[] = [
      { label: 'happiness', intensity: 6, timestamp: 110, source: 'tool' },
      { label: 'happiness', intensity: 6, timestamp: 120, source: 'tool' }
    ]
    const result = transitionEmotionState({
      previous: createState('happiness', 6, history),
      reported: report('happiness', 6),
      now: 200
    })

    expect(result.state.background).toEqual({
      label: 'happiness',
      intensity: 5.1,
      driftFactor: 0.1,
      updatedAt: 200
    })
    expect(result.diagnostics.backgroundAction).toBe('promoted')
  })

  it('keeps background stable when promotion evidence oscillates', () => {
    const history: EmotionStateHistoryEntry[] = [
      { label: 'fear', intensity: 6, timestamp: 110, source: 'tool' },
      { label: 'happiness', intensity: 6, timestamp: 120, source: 'tool' }
    ]
    const result = transitionEmotionState({
      previous: createState('happiness', 6, history),
      reported: report('happiness', 6),
      now: 200
    })

    expect(result.state.background).toEqual(createState().background)
    expect(result.diagnostics.backgroundAction).toBe('held')
  })

  it('decays accumulated residue and evicts entries below the threshold', () => {
    const previous = createState('neutral', 5, [], [{
      label: 'fear',
      intensity: 0.26,
      decay: 0.9,
      updatedAt: 100
    }])
    const result = transitionEmotionState({ previous, now: 200 })

    expect(result.changed).toBe(true)
    expect(result.state.accumulated).toEqual([])
    expect(result.diagnostics).toMatchObject({
      accumulatedAction: 'evicted',
      evictedCount: 1
    })
  })

  it('replaces accumulated residue when the tool supplies a rewrite', () => {
    const rewritten: EmotionAccumulatedEntry[] = [{
      label: 'happiness',
      intensity: 3,
      decay: 0.97,
      updatedAt: 150
    }]
    const result = transitionEmotionState({
      previous: createState(),
      reported: report('happiness', 6, rewritten),
      now: 200
    })

    expect(result.state.accumulated).toEqual([{
      ...rewritten[0],
      updatedAt: 200
    }])
    expect(result.diagnostics.accumulatedAction).toBe('rewritten')
  })

  it.each([
    {
      scenario: 'sustained stable discussion',
      previous: createState('neutral', 5),
      reported: report('neutral', 5),
      expected: {
        mode: 'reported',
        resolved: { label: 'neutral', intensity: 5 },
        intensityBounded: false,
        backgroundAction: 'held'
      }
    },
    {
      scenario: 'consecutive recognition',
      previous: createState('happiness', 6),
      reported: report('happiness', 8),
      expected: {
        mode: 'reported',
        resolved: { label: 'happiness', intensity: 8 },
        intensityBounded: false,
        backgroundAction: 'held'
      }
    },
    {
      scenario: 'single challenge',
      previous: createState('happiness', 6),
      reported: report('fear', 7),
      expected: {
        mode: 'reported',
        resolved: { label: 'fear', intensity: 7 },
        intensityBounded: false,
        backgroundAction: 'held'
      }
    },
    {
      scenario: 'rapid reversal',
      previous: createState('happiness', 8),
      reported: report('sadness', 2),
      expected: {
        mode: 'reported',
        resolved: { label: 'sadness', intensity: 6 },
        intensityBounded: true,
        backgroundAction: 'held'
      }
    }
  ])('records privacy-safe diagnostics for $scenario', ({ previous, reported, expected }) => {
    const result = transitionEmotionState({ previous, reported, now: 200 })

    expect(result.diagnostics).toMatchObject(expected)
    expect(result.diagnostics.previous).toEqual({
      label: previous.current.label,
      intensity: previous.current.intensity
    })
    expect(result.diagnostics.requested).toEqual({
      label: reported.emotion.label,
      intensity: reported.emotion.intensity
    })
    expect(result.diagnostics).not.toHaveProperty('accumulated')
    expect(JSON.stringify(result.diagnostics)).not.toContain('description')
  })
})
