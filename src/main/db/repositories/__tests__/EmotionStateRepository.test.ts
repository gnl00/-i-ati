import { describe, expect, it, vi } from 'vitest'
import { EmotionStateRepository } from '../EmotionStateRepository'

vi.mock('@main/logging/LogService', () => ({
  createLogger: () => ({ warn: vi.fn() })
}))

const emotionState: EmotionStateSnapshot = {
  current: { label: 'neutral', intensity: 5, updatedAt: 10 },
  background: { label: 'neutral', intensity: 5, driftFactor: 0.1, updatedAt: 10 },
  accumulated: [],
  history: []
}

const persistedRow = {
  scope: 'app' as const,
  state_json: JSON.stringify({ schemaVersion: 1, state: emotionState }),
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

  it('preserves created_at during upsert', () => {
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
      updated_at: 300
    }))
  })

  it('runs read-transition-write inside one transaction', () => {
    vi.spyOn(Date, 'now').mockReturnValue(300)
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })
    const nextState = {
      ...emotionState,
      current: { label: 'happiness', intensity: 7, updatedAt: 300 }
    }
    const result = repository.transitionEmotionState(previous => ({
      state: nextState,
      changed: previous?.current.label !== 'happiness',
      marker: 'updated'
    }))
    expect(result.marker).toBe('updated')
    expect(repo.transaction).toHaveBeenCalledOnce()
    expect(repo.get).toHaveBeenCalledOnce()
    expect(repo.upsert).toHaveBeenCalledOnce()
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
    const chatAState = {
      ...emotionState,
      current: { label: 'happiness', intensity: 6, updatedAt: 300 }
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
