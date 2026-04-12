import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  processActivityJournalAppend,
  processActivityJournalList,
  processActivityJournalSearch
} from '../ActivityJournalToolsProcessor'

const { appendEntryMock, listEntriesMock, searchEntriesMock, getDateKeyMock, getChatByUuidMock } = vi.hoisted(() => ({
  appendEntryMock: vi.fn(),
  listEntriesMock: vi.fn(),
  searchEntriesMock: vi.fn(),
  getDateKeyMock: vi.fn(() => '2026-03-22'),
  getChatByUuidMock: vi.fn()
}))

vi.mock('@main/services/activityJournal/ActivityJournalService', () => ({
  default: {
    appendEntry: appendEntryMock,
    listEntries: listEntriesMock,
    searchEntries: searchEntriesMock,
    getDateKey: getDateKeyMock
  }
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getChatByUuid: getChatByUuidMock
  }
}))

describe('ActivityJournalToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDateKeyMock.mockReturnValue('2026-03-22')
  })

  it('requires chat_uuid for append and passes chat id when available', async () => {
    getChatByUuidMock.mockReturnValue({ id: 42 })
    appendEntryMock.mockResolvedValue({
      indexed: true,
      entry: {
        id: 'entry-1',
        chatUuid: 'chat-1',
        chatId: 42,
        title: 'Completed task',
        category: 'summary',
        level: 'important',
        source: 'model',
        createdAt: Date.now(),
        indexed: true
      }
    })

    const result = await processActivityJournalAppend({
      chat_uuid: 'chat-1',
      title: 'Completed task',
      category: 'summary',
      level: 'important'
    })

    expect(result.success).toBe(true)
    expect(appendEntryMock).toHaveBeenCalledWith(expect.objectContaining({
      chatUuid: 'chat-1',
      chatId: 42,
      title: 'Completed task'
    }))
  })

  it('fails append when chat_uuid is missing', async () => {
    const result = await processActivityJournalAppend({
      title: 'Completed task',
      category: 'summary'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
  })

  it('lists current chat entries only when scope=current_chat', async () => {
    listEntriesMock.mockResolvedValue([
      {
        id: 'entry-2',
        chatUuid: 'chat-2',
        title: 'Blocked on cert chain issue',
        category: 'blocker',
        level: 'warning',
        source: 'model',
        createdAt: Date.now(),
        indexed: true
      }
    ])

    const result = await processActivityJournalList({
      scope: 'current_chat',
      chat_uuid: 'chat-2',
      limit: 10
    })

    expect(result.success).toBe(true)
    expect(listEntriesMock).toHaveBeenCalledWith({
      dateKey: '2026-03-22',
      limit: 10,
      chatUuid: 'chat-2'
    })
  })

  it('defaults to all-chat list for today', async () => {
    listEntriesMock.mockResolvedValue([])

    const result = await processActivityJournalList({})

    expect(result.success).toBe(true)
    expect(listEntriesMock).toHaveBeenCalledWith({
      dateKey: '2026-03-22',
      limit: 50,
      chatUuid: undefined
    })
  })

  it('searches current chat activity journal entries', async () => {
    searchEntriesMock.mockResolvedValue([
      {
        id: 'entry-3',
        chatUuid: 'chat-9',
        title: 'Fixed scheduler race',
        category: 'decision',
        level: 'important',
        source: 'model',
        createdAt: Date.now(),
        indexed: true,
        similarity: 0.88,
        score: 0.9
      }
    ])

    const result = await processActivityJournalSearch({
      query: 'scheduler race',
      scope: 'current_chat',
      chat_uuid: 'chat-9',
      limit: 5,
      withinDays: 3
    })

    expect(result.success).toBe(true)
    expect(searchEntriesMock).toHaveBeenCalledWith('scheduler race', {
      limit: 5,
      withinDays: 3,
      chatUuid: 'chat-9'
    })
  })

  it('requires chat_uuid when searching current chat scope', async () => {
    const result = await processActivityJournalSearch({
      query: 'scheduler race',
      scope: 'current_chat'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
  })
})
