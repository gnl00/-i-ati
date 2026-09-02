import { describe, expect, it } from 'vitest'
import type { EmotionStateRow } from '@main/db/dao/EmotionStateDao'
import {
  EMOTION_BASELINE_VECTOR,
  EMOTION_VAD_CENTROIDS,
  projectEmotionVector,
  vectorFromEmotionPresentation,
  ZERO_EMOTION_STIMULUS
} from '@shared/emotion/emotionVector'
import {
  EMOTION_STATE_SCHEMA_VERSION,
  parseEmotionStateRow,
  toEmotionStateRow
} from '../EmotionStateMapper'

const currentVector = { ...EMOTION_VAD_CENTROIDS.happiness }
const currentProjection = projectEmotionVector(currentVector)
const state: EmotionStateSnapshot = {
  current: {
    vector: currentVector,
    label: currentProjection.label,
    intensity: currentProjection.intensity,
    updatedAt: 100
  },
  baseline: { ...EMOTION_BASELINE_VECTOR },
  history: [{
    vector: currentVector,
    stimulus: { impact: 2, activation: 1, control: 1 },
    label: currentProjection.label,
    intensity: currentProjection.intensity,
    timestamp: 100,
    source: 'tool'
  }]
}

const row = (stateJson: string): EmotionStateRow => ({
  scope: 'app',
  state_json: stateJson,
  created_at: 10,
  updated_at: 200
})

describe('EmotionStateMapper', () => {
  it('writes and reads the version 2 vector persistence envelope', () => {
    const persisted = toEmotionStateRow(state, 200)
    const payload = JSON.parse(persisted.state_json)

    expect(payload).toEqual({
      schemaVersion: EMOTION_STATE_SCHEMA_VERSION,
      state
    })
    expect(parseEmotionStateRow(persisted)).toEqual({
      state,
      status: 'current',
      issues: []
    })
  })

  it('migrates a valid version 1 state to a deterministic version 2 vector', () => {
    const legacyState = {
      current: { label: 'happiness', intensity: 7, updatedAt: 150 },
      background: { label: 'happiness', intensity: 5.2, driftFactor: 0.1, updatedAt: 140 },
      accumulated: [{ label: 'fear', intensity: 2, decay: 0.95, updatedAt: 130 }],
      history: [{ label: 'happiness', intensity: 6, timestamp: 120, source: 'tool' }]
    }
    const result = parseEmotionStateRow(row(JSON.stringify({
      schemaVersion: 1,
      state: legacyState
    })))
    const expectedVector = vectorFromEmotionPresentation('happiness', 7)
    const expectedProjection = projectEmotionVector(expectedVector)

    expect(result.status).toBe('migrated')
    expect(result.issues).toContain('migrated_v1')
    expect(result.state.baseline).toEqual(EMOTION_BASELINE_VECTOR)
    expect(result.state.current).toEqual({
      vector: expectedVector,
      label: expectedProjection.label,
      intensity: expectedProjection.intensity,
      updatedAt: 150
    })
    expect(result.state.history.at(-1)).toMatchObject({
      vector: expectedVector,
      stimulus: ZERO_EMOTION_STIMULUS,
      timestamp: 150,
      source: 'computed'
    })
  })

  it('recovers malformed json to a version 2 neutral state', () => {
    const result = parseEmotionStateRow(row('{bad-json'))

    expect(result).toEqual({
      state: {
        current: {
          vector: { valence: 5, arousal: 3, dominance: 5 },
          label: 'neutral',
          intensity: 5,
          updatedAt: 200
        },
        baseline: { valence: 5, arousal: 3, dominance: 5 },
        history: []
      },
      status: 'recovered',
      issues: ['invalid_json']
    })
  })

  it('recovers an unknown schema to a neutral version 2 state', () => {
    const result = parseEmotionStateRow(row(JSON.stringify({ schemaVersion: 9, state })))

    expect(result.status).toBe('recovered')
    expect(result.issues).toEqual(['unsupported_schema'])
    expect(result.state.current.label).toBe('neutral')
    expect(result.state.current.vector).toEqual(EMOTION_BASELINE_VECTOR)
  })

  it('normalizes malformed version 2 vectors and history fields', () => {
    const result = parseEmotionStateRow(row(JSON.stringify({
      schemaVersion: 2,
      state: {
        current: {
          label: 'happiness',
          intensity: 7,
          vector: { valence: 20, arousal: 2, dominance: 5 },
          updatedAt: 10
        },
        baseline: { valence: 4, arousal: 4, dominance: 4 },
        history: [{
          label: 'happiness',
          intensity: 7,
          vector: { valence: 7, arousal: 4, dominance: 5 },
          timestamp: 9,
          source: 'tool'
        }]
      }
    })))

    expect(result.status).toBe('recovered')
    expect(result.issues).toEqual(expect.arrayContaining([
      'current.vector',
      'baseline.value',
      'history[0].stimulus'
    ]))
    expect(result.state.baseline).toEqual(EMOTION_BASELINE_VECTOR)
    expect(result.state.history[0].stimulus).toEqual(ZERO_EMOTION_STIMULUS)
  })
})
