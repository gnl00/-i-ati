import { describe, expect, it, vi } from 'vitest'
import { ToolResultCompactionDao } from '../ToolResultCompactionDao'

const createDatabase = (
  run: ReturnType<typeof vi.fn> = vi.fn(() => ({ changes: 1 })),
  all: ReturnType<typeof vi.fn> = vi.fn(() => []),
  get: ReturnType<typeof vi.fn> = vi.fn()
) => {
  const prepare = vi.fn((sql: string) => ({
    run: (...args: unknown[]) => (run as any)(sql, ...args),
    all: (...args: unknown[]) => (all as any)(sql, ...args),
    get: (...args: unknown[]) => (get as any)(sql, ...args)
  }))
  return { database: { prepare } as any, prepare, run, all, get }
}

describe('ToolResultCompactionDao', () => {
  it('keeps an existing ready row intact when create-or-get sees the same identity', () => {
    const existingReadyRow = {
      id: 7,
      message_id: 11,
      tool_name: 'web_fetch',
      tool_call_id: 'call-1',
      level: 'balanced',
      status: 'ready',
      content: 'compact',
      original_hash: 'hash-1',
      original_characters: 1_000,
      compacted_characters: 100,
      estimated_tokens: 25,
      execution_type: 'model',
      model_id: 'lite-model',
      prompt_version: 'v1',
      prompt_tokens: 200,
      completion_tokens: 25,
      latency_ms: 50,
      compactor_id: 'web-document',
      compactor_version: 1,
      attempts: 1,
      last_error_code: null,
      created_at: 100,
      updated_at: 200
    }
    const { database, run, get } = createDatabase(
      vi.fn(() => ({ changes: 0 })),
      vi.fn(() => []),
      vi.fn(() => existingReadyRow)
    )
    const dao = new ToolResultCompactionDao(database)

    const id = dao.upsertPending({
      ...existingReadyRow,
      status: 'pending',
      content: null,
      compacted_characters: null,
      estimated_tokens: null,
      execution_type: null,
      model_id: null,
      prompt_version: null,
      prompt_tokens: null,
      completion_tokens: null,
      latency_ms: null,
      attempts: 0,
      created_at: 300,
      updated_at: 300
    } as any)

    expect(id).toBe(7)
    expect(run.mock.calls[0][0]).toContain('DO NOTHING')
    expect(run.mock.calls[0][0]).not.toContain('DO UPDATE SET')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('claims only pending or failed rows', () => {
    const claimedDb = createDatabase(vi.fn(() => ({ changes: 1 })))
    const claimedDao = new ToolResultCompactionDao(claimedDb.database)
    expect(claimedDao.markRunning(7, 300)).toBe(true)

    const competingDb = createDatabase(vi.fn(() => ({ changes: 0 })))
    const competingDao = new ToolResultCompactionDao(competingDb.database)
    expect(competingDao.markRunning(7, 301)).toBe(false)

    expect(claimedDb.run.mock.calls[0][0]).toContain(
      "WHERE id = ? AND status IN ('pending', 'failed')"
    )
  })

  it('guards terminal updates with the running state', () => {
    const { database, run } = createDatabase()
    const dao = new ToolResultCompactionDao(database)

    dao.markReady(7, 'compact', 7, 2, undefined, 300)
    dao.markFailed(8, 'timeout', 301)

    expect(run.mock.calls[0][0]).toContain("WHERE id = ? AND status = 'running'")
    expect(run.mock.calls[1][0]).toContain("WHERE id = ? AND status = 'running'")
  })

  it('deduplicates and chunks ready lookups below SQLite bind limits', () => {
    const { database, all } = createDatabase()
    const dao = new ToolResultCompactionDao(database)
    const messageIds = Array.from({ length: 1_001 }, (_, index) => index + 1)

    dao.getReadyByMessageIds([...messageIds, 1, 500, 1_001])

    expect(all).toHaveBeenCalledTimes(3)
    expect(all.mock.calls.map(call => call.length - 1)).toEqual([500, 500, 1])
    expect(all.mock.calls.flatMap(call => call.slice(1))).toEqual(messageIds)
  })
})
