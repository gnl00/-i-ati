import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getWorkContextByChatUuidMock,
  getEmotionStateByChatIdMock,
  listRecentSmartMessageCandidateSummariesMock,
  getAllMemoriesMock,
  searchMemoriesMock,
  listActivityEntriesMock,
  searchActivityEntriesMock,
  getActivityDateKeyMock
} = vi.hoisted(() => ({
  getWorkContextByChatUuidMock: vi.fn(),
  getEmotionStateByChatIdMock: vi.fn(),
  listRecentSmartMessageCandidateSummariesMock: vi.fn(),
  getAllMemoriesMock: vi.fn(),
  searchMemoriesMock: vi.fn(),
  listActivityEntriesMock: vi.fn(),
  searchActivityEntriesMock: vi.fn(),
  getActivityDateKeyMock: vi.fn()
}))

vi.mock('@main/db/DatabaseService', () => ({
  default: {
    getWorkContextByChatUuid: getWorkContextByChatUuidMock,
    getEmotionStateByChatId: getEmotionStateByChatIdMock,
    listRecentSmartMessageCandidateSummaries: listRecentSmartMessageCandidateSummariesMock
  }
}))

vi.mock('@main/services/memory/MemoryService', () => ({
  default: {
    getAllMemories: getAllMemoriesMock,
    searchMemories: searchMemoriesMock
  }
}))

vi.mock('@main/services/activityJournal/ActivityJournalService', () => ({
  default: {
    listEntries: listActivityEntriesMock,
    searchEntries: searchActivityEntriesMock,
    getDateKey: getActivityDateKeyMock
  }
}))

import { AwakeSnapshotService } from '../AwakeSnapshotService'

const chat = {
  id: 7,
  uuid: 'chat-7',
  title: 'Emotion architecture',
  messages: [],
  createTime: 100,
  updateTime: 200
} as unknown as ChatEntity

const longCompressedSummary = `<summary>${'A'.repeat(420)} LONG_TAIL_MARKER</summary>`

describe('AwakeSnapshotService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getWorkContextByChatUuidMock.mockReturnValue({
      content: [
        '# Work Context',
        '',
        '## Current Goal',
        'Implement awake state.',
        '',
        '## Decisions',
        '- Use ephemeral user message.'
      ].join('\n')
    })
    getEmotionStateByChatIdMock.mockReturnValue({
      current: {
        label: 'curiosity',
        intensity: 6,
        updatedAt: 111
      },
      background: {
        label: 'calm',
        intensity: 5,
        driftFactor: 0.1,
        updatedAt: 100
      },
      accumulated: [{
        label: 'concern',
        description: 'Lingering worry about prompt cache',
        intensity: 2,
        decay: 0.95,
        updatedAt: 110
      }],
      history: [{
        label: 'curiosity',
        intensity: 6,
        timestamp: 111,
        source: 'tool'
      }]
    } satisfies EmotionStateSnapshot)
    getAllMemoriesMock.mockResolvedValue([
      {
        id: 'mem-pref',
        chatId: 7,
        messageId: 1,
        role: 'system',
        context_origin: '用户偏好直接、低废话的工程讨论',
        context_en: 'The user prefers direct, low-fluff engineering discussion.',
        timestamp: 90,
        metadata: {
          category: 'preference',
          importance: 'high'
        }
      },
      {
        id: 'mem-low',
        chatId: 7,
        messageId: 2,
        role: 'system',
        context_origin: 'Low priority memory',
        context_en: 'Low priority memory',
        timestamp: 80,
        metadata: {
          category: 'context',
          importance: 'low'
        }
      }
    ])
    searchMemoriesMock.mockResolvedValue([
      {
        entry: {
          id: 'mem-relevant',
          chatId: 7,
          messageId: 3,
          role: 'system',
          context_origin: 'Awake state should be ephemeral.',
          context_en: 'Awake state should be ephemeral.',
          embedding: [],
          timestamp: Date.now(),
          metadata: {
            category: 'decision',
            importance: 'high'
          }
        },
        similarity: 0.88,
        rank: 1
      }
    ])
    getActivityDateKeyMock.mockReturnValue('2026-05-14')
    listActivityEntriesMock.mockResolvedValue([
      {
        id: 'activity-1',
        title: 'Implemented awake snapshot',
        details: 'Server-side bootstrap snapshot was added.',
        category: 'summary',
        level: 'important',
        source: 'model',
        createdAt: 123,
        indexed: true
      }
    ])
    searchActivityEntriesMock.mockResolvedValue([])
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([
      {
        id: 42,
        chat_id: 2,
        chat_uuid: 'chat-2',
        summary: longCompressedSummary,
        start_message_id: 1,
        end_message_id: 5,
        compressed_at: 122,
        chat_title: 'Recent Work',
        chat_update_time: 122,
        chat_msg_count: 5
      }
    ])
  })

  it('builds an awake snapshot from memory, work context, and emotion state', async () => {
    const snapshot = await new AwakeSnapshotService().build({
      chat,
      workspacePath: './workspaces/chat-7',
      currentQuery: 'How should awake affect prompt cache?'
    })

    expect(snapshot).not.toHaveProperty('generated_at')
    expect(snapshot.chat_meta).toEqual({
      chat_id: 7,
      chat_uuid: 'chat-7',
      chat_title: 'Emotion architecture',
      workspace_path: './workspaces/chat-7'
    })
    expect(snapshot.chat_meta).not.toHaveProperty('last_active_at')
    expect(snapshot.session_meta).toEqual(snapshot.chat_meta)
    expect(snapshot.session_meta).not.toHaveProperty('last_active_at')
    expect(snapshot).not.toHaveProperty('memory')
    expect(snapshot.memories).toEqual([
      expect.objectContaining({
        content: '用户偏好直接、低废话的工程讨论',
        importance: 'high',
        category: 'preference',
        source: 'pinned_preferences'
      }),
      expect.objectContaining({
        content: 'Awake state should be ephemeral.',
        importance: 'high',
        category: 'decision',
        source: 'relevant_memories'
      })
    ])
    expect(snapshot.memories.some(item => 'context_en' in item)).toBe(false)
    expect(snapshot.work_context).toEqual(expect.objectContaining({
      exists: true,
      truncated: false
    }))
    expect(snapshot.emotion.baseline).toEqual({
      label: 'curiosity',
      intensity: 6,
      source: 'awake_carryover'
    })
    expect(snapshot.emotion.baseline).not.toHaveProperty('updated_at')
    expect(snapshot.emotion.accumulated[0].description).toContain('prompt cache')
    const journalActivity = snapshot.recent_activities.find(item => item.source === 'activity_journal')
    const compressedActivity = snapshot.recent_activities.find(item => item.source === 'compressed_summary')
    expect(journalActivity).toEqual(
      expect.objectContaining({
        source: 'activity_journal',
        id: 'activity-1',
        summary: 'Server-side bootstrap snapshot was added.'
      })
    )
    expect(compressedActivity).toEqual(
      expect.objectContaining({
        source: 'compressed_summary',
        id: '42'
      })
    )
    expect(compressedActivity?.summary.length).toBeLessThanOrEqual(320)
    expect(compressedActivity?.summary).not.toContain('LONG_TAIL_MARKER')
    expect(compressedActivity?.summary).not.toContain('<summary>')
  })

  it('returns safe defaults when memory fails', async () => {
    getAllMemoriesMock.mockRejectedValue(new Error('memory unavailable'))

    const snapshot = await new AwakeSnapshotService().build({
      chat,
      currentQuery: 'hello'
    })

    expect(snapshot.memories).toEqual([])
    expect('diagnostics' in snapshot).toBe(false)
    expect(snapshot.emotion.baseline.label).toBe('curiosity')
  })
})
