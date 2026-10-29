import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: (): string => '/tmp/memory-test' } }))
vi.mock('@main/logging/LogService', () => ({ createLogger: (): object => ({ info: vi.fn(), debug: vi.fn(), error: vi.fn() }) }))
vi.mock('../../embedding/EmbeddingService', () => ({ default: { generateEmbedding: async (): Promise<{ embedding: number[] }> => ({ embedding: [1, 0] }) } }))
import memory from '../MemoryService'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync: new (path: string) => Pick<Database.Database, 'exec' | 'close' | 'prepare'> & {
    function(name: string, callback: (...args: unknown[]) => number): void
  }
}
const internal = memory as unknown as { db: unknown; isInitialized: boolean; createIndexes(): void }
afterEach(() => memory.close())

function setup(): InstanceType<typeof DatabaseSync> {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE memories (id TEXT PRIMARY KEY, chat_id INTEGER, message_id INTEGER,
    role TEXT, context_origin TEXT, context_en TEXT, timestamp INTEGER, metadata TEXT);
    CREATE TABLE vec_memories (memory_id TEXT, embedding BLOB);`)
  db.function('vec_distance_cosine', (distance, query) => { void query; return Number(distance) })
  internal.db = db
  internal.isInitialized = true
  internal.createIndexes()
  return db
}

describe('memory retrieval SQL', () => {
  it('selects bounded pinned preferences using the partial index', async () => {
    const db = setup()
    const insert = db.prepare("INSERT INTO memories VALUES (?,1,1,'user','text','text',?,?)")
    for (let i = 0; i < 200; i++) insert.run(`low-${i}`, i, '{"importance":"low"}')
    for (let i = 0; i < 5; i++) insert.run(`pinned-${i}`, i, '{"importance":" high ","category":" preference "}')
    insert.run('invalid-json', 999, 'invalid')
    expect((await memory.getPinnedMemories(3)).map(row => row.id)).toEqual(['pinned-4', 'pinned-3', 'pinned-2'])
    const indexSql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='idx_pinned_memories'").get() as { sql: string }).sql
    const predicate = indexSql.split(' WHERE ')[1]
    const plan = db.prepare(`EXPLAIN QUERY PLAN SELECT * FROM memories WHERE ${predicate} ORDER BY timestamp DESC LIMIT 3`).all()
    expect(JSON.stringify(plan)).toContain('idx_pinned_memories')
  })

  it('honors threshold boundaries before loading vectors and ranks only surviving results', async () => {
    const db = setup()
    for (const [id, distance] of [['high', 0.1], ['boundary', 0.4], ['low', 0.7]] as const) {
      db.prepare("INSERT INTO memories VALUES (?,1,1,'user','text','text',1,NULL)").run(id)
      db.prepare('INSERT INTO vec_memories VALUES (?,?)').run(id, distance)
    }
    // Stored fixture distance is numeric, while production stores a vector blob.
    const rowMapper = vi.spyOn(memory as unknown as { rowToEntry(row: { id: string }): { id: string } }, 'rowToEntry')
      .mockImplementation(row => ({ id: row.id }))
    try {
      const results = await memory.searchMemories('query', { threshold: 0.6 })
      expect(results.map(item => [item.entry.id, item.rank])).toEqual([['high', 1], ['boundary', 2]])
      expect(rowMapper).toHaveBeenCalledTimes(2)
    } finally { rowMapper.mockRestore() }
  })
})
