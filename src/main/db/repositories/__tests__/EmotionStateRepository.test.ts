import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmotionStateRepository } from '../EmotionStateRepository'

type MockEmotionStateRow = {
  chat_id: number
  chat_uuid: string
  state_json: string
  created_at: number
  updated_at: number
  chatExists?: boolean
}

const createRepo = (rows: MockEmotionStateRow[] = []) => ({
  getByChatId: vi.fn((chatId: number) => rows.find(row => row.chat_id === chatId)),
  getByChatUuid: vi.fn((chatUuid: string) => rows.find(row => row.chat_uuid === chatUuid)),
  getLatest: vi.fn(() => [...rows]
    .filter(row => row.chatExists !== false)
    .sort((left, right) => right.updated_at - left.updated_at)[0]),
  upsert: vi.fn((row: MockEmotionStateRow) => {
    const index = rows.findIndex(item => item.chat_id === row.chat_id)
    if (index >= 0) {
      rows[index] = { ...row }
      return
    }
    rows.push({ ...row })
  }),
  deleteByChatId: vi.fn()
})

describe('EmotionStateRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('materializes row payloads through the mapper and returns undefined for malformed json', () => {
    const repo = createRepo([
      {
        chat_id: 7,
        chat_uuid: 'chat-7',
        state_json: '{"mood":"calm"}',
        created_at: 10,
        updated_at: 20
      },
      {
        chat_id: 8,
        chat_uuid: 'chat-8',
        state_json: '{bad-json',
        created_at: 11,
        updated_at: 21
      }
    ])
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    expect(repository.getEmotionStateByChatId(7)).toEqual({ mood: 'calm' })
    expect(repository.getEmotionStateByChatId(8)).toBeUndefined()
  })

  it('returns the latest emotion state by updated_at through the mapper', () => {
    const repo = createRepo([
      {
        chat_id: 7,
        chat_uuid: 'chat-7',
        state_json: '{"current":{"label":"sadness","intensity":3}}',
        created_at: 10,
        updated_at: 200
      },
      {
        chat_id: 8,
        chat_uuid: 'chat-8',
        state_json: '{"current":{"label":"happiness","intensity":8}}',
        created_at: 11,
        updated_at: 300
      }
    ])
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    expect(repository.getLatestEmotionState()).toEqual({
      current: {
        label: 'happiness',
        intensity: 8
      }
    })
  })

  it('returns the latest live chat emotion state when a newer row is orphaned', () => {
    const repo = createRepo([
      {
        chat_id: 7,
        chat_uuid: 'chat-7',
        state_json: '{"current":{"label":"calm","intensity":4}}',
        created_at: 10,
        updated_at: 200
      },
      {
        chat_id: 8,
        chat_uuid: 'chat-8',
        state_json: '{"current":{"label":"sadness","intensity":9}}',
        created_at: 11,
        updated_at: 300,
        chatExists: false
      }
    ])
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    expect(repository.getLatestEmotionState()).toEqual({
      current: {
        label: 'calm',
        intensity: 4
      }
    })
  })

  it('returns undefined when no latest emotion state exists', () => {
    const repo = createRepo()
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    expect(repository.getLatestEmotionState()).toBeUndefined()
  })

  it('preserves created_at while stamping updated_at during upsert', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1710000000000)

    const repo = createRepo([{
      chat_id: 7,
      chat_uuid: 'chat-7',
      state_json: '{"mood":"old"}',
      created_at: 100,
      updated_at: 200
    }])
    const repository = new EmotionStateRepository({
      hasDb: () => true,
      getEmotionStateRepo: () => repo as any
    })

    repository.upsertEmotionState(7, 'chat-7', { mood: 'focused' } as unknown as EmotionStateSnapshot)

    expect(repo.upsert).toHaveBeenCalledWith({
      chat_id: 7,
      chat_uuid: 'chat-7',
      state_json: JSON.stringify({ mood: 'focused' }),
      created_at: 100,
      updated_at: 1710000000000
    })
  })
})
