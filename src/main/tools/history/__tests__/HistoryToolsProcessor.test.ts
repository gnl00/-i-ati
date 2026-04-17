import { beforeEach, describe, expect, it, vi } from 'vitest'
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
      query: ' implementation ',
      limit: 99
    })

    expect(result.success).toBe(true)
    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: 'implementation',
      limit: 10,
      scope: 'all',
      withinDays: 3,
      chat_uuid: undefined
    })
    expect(result.count).toBe(1)
  })

  it('requires chat_uuid when scope=current_chat', async () => {
    const result = await processHistorySearch({
      query: 'implementation',
      limit: 3,
      scope: 'current_chat'
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('chat_uuid')
    expect(searchHistoryMock).not.toHaveBeenCalled()
  })

  it('passes current_chat scope and clamps withinDays to 7', async () => {
    searchHistoryMock.mockReturnValue([])

    const result = await processHistorySearch({
      limit: 0,
      scope: 'current_chat',
      chat_uuid: 'chat-9',
      withinDays: 30
    })

    expect(result.success).toBe(true)
    expect(searchHistoryMock).toHaveBeenCalledWith({
      query: undefined,
      limit: 1,
      scope: 'current_chat',
      withinDays: 7,
      chat_uuid: 'chat-9'
    })
    expect(result.message).toContain('No recent history')
  })
})
