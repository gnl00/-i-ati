import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SMART_MESSAGE_TTL_MS } from '@shared/constants/smartMessages'

const {
  dbExecMock,
  dbPrepareMock,
  dbPragmaMock,
  dbRunMock,
  dbAllMock
} = vi.hoisted(() => ({
  dbExecMock: vi.fn(),
  dbPrepareMock: vi.fn(),
  dbPragmaMock: vi.fn(),
  dbRunMock: vi.fn(),
  dbAllMock: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/ati-db-test')
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn()
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn(function MockDatabase() {
    return {
      exec: dbExecMock,
      prepare: dbPrepareMock,
      pragma: dbPragmaMock,
      close: vi.fn()
    }
  })
}))

describe('AppDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    dbPrepareMock.mockReturnValue({
      all: dbAllMock,
      run: dbRunMock
    })
    dbAllMock.mockReturnValue([])
  })

  it('migrates legacy smart message expiry from 48 hours to 7 days on initialize', async () => {
    const { AppDatabase } = await import('../Database')

    AppDatabase.getInstance().initialize()

    const migrationStatement = dbPrepareMock.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('UPDATE smart_messages')
    )

    expect(migrationStatement?.[0]).toContain('SET expires_at = generated_at + ?')
    expect(migrationStatement?.[0]).toContain('WHERE expires_at = generated_at + ?')
    expect(dbRunMock).toHaveBeenCalledWith(SMART_MESSAGE_TTL_MS, 48 * 60 * 60 * 1000)
  })

  it('creates a unique chat skill index on chat and skill name', async () => {
    const { AppDatabase } = await import('../Database')

    AppDatabase.getInstance().initialize()

    const createIndexSql = dbExecMock.mock.calls
      .map(([sql]) => sql)
      .find((sql) =>
        typeof sql === 'string' && sql.includes('idx_chat_skills_chat_skill_unique')
      )

    expect(createIndexSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_skills_chat_skill_unique ON chat_skills(chat_id, skill_name)'
    )
  })

  it('adds token usage detail storage to messages', async () => {
    const { AppDatabase } = await import('../Database')

    AppDatabase.getInstance().initialize()

    const createMessagesSql = dbExecMock.mock.calls
      .map(([sql]) => sql)
      .find((sql) => typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS messages'))
    const migrationSql = dbExecMock.mock.calls
      .map(([sql]) => sql)
      .find((sql) => typeof sql === 'string' && sql.includes('ALTER TABLE messages ADD COLUMN token_usage TEXT'))

    expect(createMessagesSql).toContain('token_usage TEXT')
    expect(migrationSql).toContain('ALTER TABLE messages ADD COLUMN token_usage TEXT')
  })
})
