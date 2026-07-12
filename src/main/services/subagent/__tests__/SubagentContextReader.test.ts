import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getWorkContextByChatUuidMock, getDateKeyMock, listEntriesMock } = vi.hoisted(() => ({
  getWorkContextByChatUuidMock: vi.fn(),
  getDateKeyMock: vi.fn(() => '2026-07-12'),
  listEntriesMock: vi.fn()
}))

vi.mock('@main/db/chat', () => ({
  chatDb: {
    getWorkContextByChatUuid: getWorkContextByChatUuidMock
  }
}))

vi.mock('@main/services/activityJournal/ActivityJournalService', () => ({
  default: {
    getDateKey: getDateKeyMock,
    listEntries: listEntriesMock
  }
}))

import { WORK_CONTEXT_TEMPLATE } from '@main/services/workContext/WorkContextService'
import { DefaultSubagentContextReader } from '../SubagentContextReader'

describe('DefaultSubagentContextReader', () => {
  beforeEach(() => {
    getWorkContextByChatUuidMock.mockReset()
    getDateKeyMock.mockClear()
    listEntriesMock.mockReset()
  })

  it('returns stored work context and recent journal entries', async () => {
    getWorkContextByChatUuidMock.mockReturnValue({ content: 'Current goal: ship safely' })
    listEntriesMock.mockResolvedValue([{ title: 'Reviewed boundaries' }])
    const reader = new DefaultSubagentContextReader()

    expect(reader.getWorkContext('chat-1')).toBe('Current goal: ship safely')
    await expect(reader.listRecentActivity('chat-1', 5)).resolves.toEqual([
      { title: 'Reviewed boundaries' }
    ])
    expect(listEntriesMock).toHaveBeenCalledWith({
      dateKey: '2026-07-12',
      chatUuid: 'chat-1',
      limit: 5
    })
  })

  it('returns the work context template when no record exists', () => {
    getWorkContextByChatUuidMock.mockReturnValue(undefined)

    expect(new DefaultSubagentContextReader().getWorkContext('chat-1'))
      .toBe(WORK_CONTEXT_TEMPLATE)
  })

  it('returns the work context template when the database read fails', () => {
    getWorkContextByChatUuidMock.mockImplementation(() => {
      throw new Error('database unavailable')
    })

    expect(new DefaultSubagentContextReader().getWorkContext('chat-1'))
      .toBe(WORK_CONTEXT_TEMPLATE)
  })

  it('returns an empty journal when activity journal loading fails', async () => {
    listEntriesMock.mockRejectedValue(new Error('journal unavailable'))

    await expect(new DefaultSubagentContextReader().listRecentActivity('chat-1', 5))
      .resolves.toEqual([])
  })
})
