import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmotionStateRepository } from '../EmotionStateRepository'

const createRepo = (rows: any[] = []) => ({
  getByChatId: vi.fn((chatId: number) => rows.find(row => row.chat_id === chatId)),
  getByChatUuid: vi.fn((chatUuid: string) => rows.find(row => row.chat_uuid === chatUuid)),
  upsert: vi.fn((row: any) => {
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
