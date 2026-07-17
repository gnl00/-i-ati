import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_SEARCH_HIGHLIGHT_END,
  CHAT_SEARCH_HIGHLIGHT_START
} from '@shared/search/chatSearchHighlights'
import type { HistorySearchArgs } from '@tools/history/index.d'
import { processHistorySearch } from '../HistoryToolsProcessor'

const { searchHistoryMock } = vi.hoisted(() => ({
  searchHistoryMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    searchHistory: searchHistoryMock
  }
}))

describe('HistoryToolsProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches recent history with default withinDays=3 and clamped limit', async () => {
    searchHistoryMock.mockReturnValue([
      {
        chatUuid: 'chat-1',
        chatId: 1,
        chatTitle: 'Implementation Plan',
        matchedMessageId: 101,
        matchedFields: ['message'],
        hitCount: 2,
        createdAt: 1,
        snippet: 'implementation details',
        messages: []
      }
    ])

    const result = await processHistorySearch({
      query: [' implementation '],
      limit: 99
    })

    expect(result.success).toBe(true)
    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: ['implementation'],
      limit: 10,
      scope: 'all',
      withinDays: 3,
      chat_uuid: undefined
    })
    expect(result.count).toBe(1)
  })

  it('returns plain-text snippets without UI highlight markers', async () => {
    searchHistoryMock.mockReturnValue([
      {
        chatUuid: 'chat-1',
        chatId: 1,
        chatTitle: 'Implementation Plan',
        matchedMessageId: 101,
        matchedFields: ['message'],
        hitCount: 1,
        createdAt: 1,
        snippet: [
          'review ',
          CHAT_SEARCH_HIGHLIGHT_START,
          'implementation',
          CHAT_SEARCH_HIGHLIGHT_END,
          ' details'
        ].join(''),
        messages: []
      }
    ])

    const result = await processHistorySearch({
      query: ['implementation'],
      limit: 5
    })

    expect(result.items[0]?.snippet).toBe('review implementation details')
    expect(result.items[0]?.snippet).not.toContain(CHAT_SEARCH_HIGHLIGHT_START)
    expect(result.items[0]?.snippet).not.toContain(CHAT_SEARCH_HIGHLIGHT_END)
  })

  it('requires chat_uuid when scope=current_chat', async () => {
    const result = await processHistorySearch({
      query: ['implementation'],
      limit: 3,
      scope: 'current_chat'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
    expect(searchHistoryMock).not.toHaveBeenCalled()
  })

  it('passes current_chat scope and clamps withinDays to 30', async () => {
    searchHistoryMock.mockReturnValue([])

    const result = await processHistorySearch({
      limit: 0,
      scope: 'current_chat',
      chat_uuid: 'chat-9',
      withinDays: 60
    })

    expect(result.success).toBe(true)
    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: undefined,
      limit: 1,
      scope: 'current_chat',
      withinDays: 30,
      chat_uuid: 'chat-9'
    })
    expect(result.message).toContain('No recent history')
  })

  it('passes query arrays as independent history keywords', async () => {
    searchHistoryMock.mockReturnValue([])

    await processHistorySearch({
      query: ['呼和浩特', 'Hohhot', '呼市'],
      limit: 3
    })

    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: ['呼和浩特', 'Hohhot', '呼市'],
      limit: 3,
      scope: 'all',
      withinDays: 3,
      chat_uuid: undefined
    })
  })

  it('rejects legacy string query arguments at runtime', async () => {
    const result = await processHistorySearch({
      query: '呼和浩特 Hohhot',
      limit: 5
    } as unknown as HistorySearchArgs)

    expect(result.success).toBe(false)
    expect(result.message).toContain('query must be an array')
    expect(searchHistoryMock).not.toHaveBeenCalled()
  })
})
