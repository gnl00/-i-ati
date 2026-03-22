import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  saveEntryMock,
  listEntriesMock,
  searchEntriesMock,
  databaseExecMock,
  sqliteVecLoadMock
} = vi.hoisted(() => ({
  saveEntryMock: vi.fn(),
  listEntriesMock: vi.fn(),
  searchEntriesMock: vi.fn(),
  databaseExecMock: vi.fn(),
  sqliteVecLoadMock: vi.fn()
}))

vi.mock('@main/services/logging/LogService', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('sqlite-vec', () => ({
  default: {
    load: sqliteVecLoadMock
  },
  load: sqliteVecLoadMock
}))

vi.mock('better-sqlite3', () => ({
  default: vi.fn().mockImplementation(function MockDatabase() {
    return {
      pragma: vi.fn(),
      exec: databaseExecMock,
      close: vi.fn()
    }
  })
}))

vi.mock('../ActivityJournalRepository', () => ({
  ActivityJournalRepository: vi.fn().mockImplementation(function MockActivityJournalRepository() {
    return {
      saveEntry: saveEntryMock,
      listEntries: listEntriesMock,
      searchEntries: searchEntriesMock
    }
  })
}))

import { ActivityJournalService } from '../ActivityJournalService'

const makeEmbedding = () => Array.from({ length: 384 }, (_, index) => index / 1000)

describe('ActivityJournalService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listEntriesMock.mockReset()
    saveEntryMock.mockReset()
    searchEntriesMock.mockReset()
  })

  it('appends indexed summary entries and persists indexed flag', async () => {
    const service = new ActivityJournalService({
      resolveBaseDir: () => '/tmp/activity-journal-test',
      embeddingService: {
        generateEmbedding: vi.fn(async () => ({ embedding: makeEmbedding() }))
      }
    })

    const result = await service.appendEntry({
      chatUuid: 'chat-1',
      chatId: 101,
      title: 'Finished remote plugin registry service',
      details: 'Validated registry items and returned remote catalog data.',
      category: 'summary',
      level: 'important',
      tags: ['plugins', 'registry']
    })

    expect(sqliteVecLoadMock).toHaveBeenCalledTimes(1)
    expect(databaseExecMock).toHaveBeenCalled()
    expect(saveEntryMock).toHaveBeenCalledTimes(1)
    const savedRow = saveEntryMock.mock.calls[0][0]
    const savedVector = saveEntryMock.mock.calls[0][1]
    expect(savedRow.chat_uuid).toBe('chat-1')
    expect(savedRow.chat_id).toBe(101)
    expect(savedRow.indexed).toBe(1)
    expect(savedVector).toBeInstanceOf(Buffer)
    expect(result.indexed).toBe(true)
    expect(result.entry.indexed).toBe(true)
    service.close()
  })

  it('does not index note entries and supports chat-scoped listing', async () => {
    const generateEmbedding = vi.fn(async () => ({ embedding: makeEmbedding() }))
    const service = new ActivityJournalService({
      resolveBaseDir: () => '/tmp/activity-journal-test',
      embeddingService: { generateEmbedding }
    })

    await service.appendEntry({
      chatUuid: 'chat-1',
      title: 'Started MCP card review',
      category: 'note'
    })

    expect(generateEmbedding).not.toHaveBeenCalled()
    const savedRow = saveEntryMock.mock.calls[0][0]
    expect(savedRow.indexed).toBe(0)

    listEntriesMock.mockReturnValue([
      {
        id: 'entry-2',
        chat_uuid: 'chat-1',
        chat_id: 7,
        title: 'Started MCP card review',
        details: null,
        category: 'note',
        level: 'info',
        tags_json: null,
        source: 'model',
        indexed: 0,
        created_at: 1774147200000
      }
    ])

    const entries = await service.listEntries({
      dateKey: '2026-03-22',
      limit: 20,
      chatUuid: 'chat-1'
    })

    expect(listEntriesMock).toHaveBeenCalledWith({
      dateKey: '2026-03-22',
      limit: 20,
      chatUuid: 'chat-1'
    })
    expect(entries).toHaveLength(1)
    expect(entries[0].indexed).toBe(false)
    expect(entries[0].chatUuid).toBe('chat-1')
    service.close()
  })

  it('searches indexed entries with semantic similarity and recency scoring', async () => {
    const generateEmbedding = vi.fn(async () => ({ embedding: makeEmbedding() }))
    const service = new ActivityJournalService({
      resolveBaseDir: () => '/tmp/activity-journal-test',
      embeddingService: { generateEmbedding }
    })

    const now = Date.now()
    searchEntriesMock.mockReturnValue([
      {
        id: 'entry-1',
        chat_uuid: 'chat-1',
        chat_id: 7,
        title: 'Implemented remote plugin install flow',
        details: null,
        category: 'task',
        level: 'important',
        tags_json: JSON.stringify(['plugins']),
        source: 'model',
        indexed: 1,
        created_at: now - 3600000,
        distance: 0.18
      },
      {
        id: 'entry-2',
        chat_uuid: 'chat-2',
        chat_id: 8,
        title: 'Older plugin catalog cleanup',
        details: null,
        category: 'summary',
        level: 'info',
        tags_json: null,
        source: 'model',
        indexed: 1,
        created_at: now - (6 * 86400000),
        distance: 0.12
      }
    ])

    const results = await service.searchEntries('plugin install', {
      limit: 2,
      withinDays: 7
    })

    expect(generateEmbedding).toHaveBeenCalledWith('plugin install')
    expect(searchEntriesMock).toHaveBeenCalledWith(expect.any(Buffer), {
      topK: 6,
      chatUuid: undefined,
      startAt: expect.any(Number)
    })
    expect(results).toHaveLength(2)
    expect(results[0].id).toBe('entry-1')
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })
})
