import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { EmotionStateDao } from '../EmotionStateDao'
import type { EmotionStateRow } from '../EmotionStateDao'

describe('EmotionStateDao', () => {
  it('returns the newest emotion state whose chat still exists', () => {
    const rows: Array<EmotionStateRow & { chatExists: boolean }> = [{
      chat_id: 7,
      chat_uuid: 'chat-7',
      state_json: '{"current":{"label":"calm","intensity":4}}',
      created_at: 100,
      updated_at: 200,
      chatExists: true
    }, {
      chat_id: 8,
      chat_uuid: 'chat-8',
      state_json: '{"current":{"label":"sadness","intensity":9}}',
      created_at: 100,
      updated_at: 300,
      chatExists: false
    }]
    const preparedSql: string[] = []
    const db = {
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql)
        return {
          get: vi.fn(() => {
            const isLatestQuery = sql.includes('ORDER BY emotion_states.updated_at DESC')
            if (!isLatestQuery) return undefined

            const candidates = sql.includes('INNER JOIN chats')
              ? rows.filter(row => row.chatExists)
              : rows
            const latest = [...candidates]
              .sort((left, right) => right.updated_at - left.updated_at)[0]
            if (!latest) return undefined
            return {
              chat_id: latest.chat_id,
              chat_uuid: latest.chat_uuid,
              state_json: latest.state_json,
              created_at: latest.created_at,
              updated_at: latest.updated_at
            }
          }),
          run: vi.fn()
        }
      })
    } as unknown as Database.Database
    const dao = new EmotionStateDao(db)

    expect(dao.getLatest()).toEqual({
      chat_id: 7,
      chat_uuid: 'chat-7',
      state_json: '{"current":{"label":"calm","intensity":4}}',
      created_at: 100,
      updated_at: 200
    })
    expect(preparedSql.join('\n')).toContain('INNER JOIN chats ON chats.id = emotion_states.chat_id')
    expect(preparedSql.join('\n')).toContain('SELECT emotion_states.*')
  })
})
