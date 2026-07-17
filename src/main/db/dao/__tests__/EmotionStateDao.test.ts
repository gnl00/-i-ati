import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { EmotionStateDao } from '../EmotionStateDao'

describe('EmotionStateDao', () => {
  it('uses the fixed app singleton scope and provides transactions', () => {
    const preparedSql: string[] = []
    const appRow = {
      scope: 'app' as const,
      state_json: '{"schemaVersion":1}',
      created_at: 100,
      updated_at: 200
    }
    const db = {
      transaction: vi.fn((operation: () => unknown) => vi.fn(operation)),
      prepare: vi.fn((sql: string) => {
        preparedSql.push(sql)
        return {
          get: vi.fn(() => sql.includes('SELECT *') ? appRow : undefined),
          run: vi.fn()
        }
      })
    } as unknown as Database.Database
    const dao = new EmotionStateDao(db)

    expect(dao.get()).toEqual(appRow)
    expect(preparedSql.join('\n')).toContain('app_emotion_state')
    expect(preparedSql.join('\n')).toContain("scope = 'app'")
    expect(preparedSql.join('\n')).not.toContain('chat_id')
    expect(preparedSql.join('\n')).not.toContain('FOREIGN KEY')
    expect(dao.transaction(() => 'committed')).toBe('committed')
    expect(db.transaction).toHaveBeenCalledOnce()
  })

})
