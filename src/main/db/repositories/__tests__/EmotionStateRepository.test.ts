import { describe, expect, it, vi } from 'vitest'
import {
  EMOTION_BASELINE_VECTOR,
  projectEmotionVector
} from '@shared/emotion/emotionVector'
import { EmotionStateRepository } from '../EmotionStateRepository'

vi.mock('@main/logging/LogService', () => ({
  createLogger: () => ({ warn: vi.fn() })
}))

const projection = projectEmotionVector(EMOTION_BASELINE_VECTOR)
const emotionState: EmotionStateSnapshot = {
  current: {
    vector: { ...EMOTION_BASELINE_VECTOR },
    label: projection.label,
    intensity: projection.intensity,
    updatedAt: 10
  },
  baseline: { ...EMOTION_BASELINE_VECTOR },
  history: []
}

const persistedRow = {
  scope: 'app' as const,
  state_json: JSON.stringify({ schemaVersion: 2, state: emotionState }),
  created_at: 100,
  updated_at: 200
}

const createRepo = (initial = persistedRow) => {
  let row: typeof persistedRow | undefined = initial
  return {
    get: vi.fn(() => row),
    upsert: vi.fn((next: typeof persistedRow) => { row = next }),
    delete: vi.fn(() => { row = undefined }),
    transaction: vi.fn(<T>(operation: () => T): T => operation())
  }
}

describe('EmotionStateRepository', () => {
  it('reads the app singleton', () => {
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    expect(repository.getEmotionState()).toEqual(emotionState)
    expect(repo.get).toHaveBeenCalledOnce()
  })

  it('rewrites a version 1 singleton row as version 2 during read migration', () => {
    const repo = createRepo({
      ...persistedRow,
      state_json: JSON.stringify({
        schemaVersion: 1,
        state: {
          current: { label: 'happiness', intensity: 7, updatedAt: 120 },
          history: []
        }
      })
    })
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    const result = repository.getEmotionState()

    expect(result?.baseline).toEqual(EMOTION_BASELINE_VECTOR)
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      created_at: 100,
      updated_at: 200,
      state_json: expect.stringContaining('"schemaVersion":2')
    }))
  })

  it('preserves created_at and writes a version 2 envelope during upsert', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300)
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    repository.upsertEmotionState(emotionState)
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'app',
      created_at: 100,
      updated_at: 300,
      state_json: expect.stringContaining('"schemaVersion":2')
    }))
  })

  it('runs read-transition-write inside one transaction', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300)
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    const nextVector = { valence: 4, arousal: 4, dominance: 5 }
    const nextProjection = projectEmotionVector(nextVector)
    const nextState: EmotionStateSnapshot = {
      ...emotionState,
      current: {
        ...emotionState.current,
        vector: nextVector,
        label: nextProjection.label,
        intensity: nextProjection.intensity,
        updatedAt: 300
      }
    }
    const result = repository.transitionEmotionState(previous => ({
      state: nextState,
      changed: previous?.current.vector.valence !== nextVector.valence,
      marker: 'updated'
    }))
    expect(result.marker).toBe('updated')
    expect(repo.transaction).toHaveBeenCalledOnce()
    expect(repo.get).toHaveBeenCalledOnce()
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({
      updated_at: 300,
      state_json: expect.stringContaining('"schemaVersion":2')
    }))
  })

  it('skips writes for unchanged transitions and supports explicit clear', () => {
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    repository.transitionEmotionState(() => ({ state: emotionState, changed: false }))
    expect(repo.upsert).not.toHaveBeenCalled()
    repository.clearEmotionState()
    expect(repo.delete).toHaveBeenCalledOnce()
  })

  it('uses the state committed by one chat turn as the next chat turn baseline', () => {
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    const chatAState: EmotionStateSnapshot = {
      ...emotionState,
      current: {
        ...emotionState.current,
        vector: { valence: 3, arousal: 4, dominance: 4 },
        label: projectEmotionVector({ valence: 3, arousal: 4, dominance: 4 }).label,
        intensity: projectEmotionVector({ valence: 3, arousal: 4, dominance: 4 }).intensity,
        updatedAt: 300
      }
    }
    repository.transitionEmotionState(() => ({ state: chatAState, changed: true }))

    let chatBBaseline: EmotionStateSnapshot | undefined
    repository.transitionEmotionState(previous => {
      chatBBaseline = previous
      return { state: previous!, changed: false }
    })

    expect(chatBBaseline).toEqual(chatAState)
    expect(repo.transaction).toHaveBeenCalledTimes(2)
  })
})
