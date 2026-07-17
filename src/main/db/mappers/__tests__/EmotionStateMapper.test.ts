import { describe, expect, it } from 'vitest'
import type { EmotionStateRow } from '@main/db/dao/EmotionStateDao'
import {
  EMOTION_STATE_SCHEMA_VERSION,
  parseEmotionStateRow,
  toEmotionStateRow
} from '../EmotionStateMapper'

const state: EmotionStateSnapshot = {
  current: { label: 'happiness', intensity: 7, updatedAt: 100 },
  background: { label: 'neutral', intensity: 5, driftFactor: 0.1, updatedAt: 90 },
  accumulated: [{
    label: 'happiness',
    intensity: 2.5,
    decay: 0.95,
    updatedAt: 100
  }],
  history: [{
    label: 'happiness',
    intensity: 7,
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
  it('writes and reads the version 1 persistence envelope', () => {
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

  it('recovers an unversioned snapshot as an unsupported schema', () => {
    expect(parseEmotionStateRow(row(JSON.stringify(state)))).toEqual({
      state: {
        current: { label: 'neutral', intensity: 5, updatedAt: 200 },
        background: {
          label: 'neutral',
          intensity: 5,
          driftFactor: 0.1,
          updatedAt: 200
        },
        accumulated: [],
        history: []
      },
      status: 'recovered',
      issues: ['unsupported_schema']
    })
  })

  it('recovers malformed json to a neutral state', () => {
    expect(parseEmotionStateRow(row('{bad-json'))).toEqual({
      state: {
        current: { label: 'neutral', intensity: 5, updatedAt: 200 },
        background: {
          label: 'neutral',
          intensity: 5,
          driftFactor: 0.1,
          updatedAt: 200
        },
        accumulated: [],
        history: []
      },
      status: 'recovered',
      issues: ['invalid_json']
    })
  })

  it('normalizes missing and invalid version 1 fields with documented defaults', () => {
    const result = parseEmotionStateRow(row(JSON.stringify({
      schemaVersion: 1,
      state: {
        current: { label: 'unknown', intensity: 20 },
        background: { intensity: 1, driftFactor: 0 },
        accumulated: [{
          label: 'fear',
          intensity: 0.1
        }],
        history: [{ label: 'fear', intensity: 20, timestamp: 10, source: 'tool' }]
      }
    })))

    expect(result.status).toBe('recovered')
    expect(result.state).toEqual({
      current: { label: 'neutral', intensity: 10, updatedAt: 200 },
      background: {
        label: 'neutral',
        intensity: 3,
        driftFactor: 0.1,
        updatedAt: 200
      },
      accumulated: [{
        label: 'fear',
        intensity: 0.25,
        decay: 0.95,
        updatedAt: 200
      }],
      history: [{
        label: 'fear',
        intensity: 10,
        timestamp: 10,
        source: 'tool'
      }]
    })
    expect(result.issues).toEqual(expect.arrayContaining([
      'current.label',
      'background.label',
      'background.driftFactor'
    ]))
  })

  it('keeps the strongest accumulated entry for each label', () => {
    const result = parseEmotionStateRow(row(JSON.stringify({
      schemaVersion: 1,
      state: {
        ...state,
        accumulated: [
          { label: 'fear', intensity: 1, decay: 0.95, updatedAt: 100 },
          { label: 'happiness', intensity: 2, decay: 0.95, updatedAt: 110 },
          { label: 'fear', intensity: 4, decay: 0.97, updatedAt: 120 }
        ]
      }
    })))

    expect(result.state.accumulated).toEqual([
      { label: 'fear', intensity: 4, decay: 0.97, updatedAt: 120 },
      { label: 'happiness', intensity: 2, decay: 0.95, updatedAt: 110 }
    ])
  })
})
