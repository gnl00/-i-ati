import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMOTION_BASELINE_VECTOR,
  projectEmotionVector
} from '@shared/emotion/emotionVector'

const {
  getWorkContextByChatUuidMock,
  getEmotionStateMock,
  listRecentSmartMessageCandidateSummariesMock,
  getAllMemoriesMock,
  searchMemoriesMock,
  listActivityEntriesMock,
  searchActivityEntriesMock,
  getActivityDateKeyMock
} = vi.hoisted(() => ({
  getWorkContextByChatUuidMock: vi.fn(),
  getEmotionStateMock: vi.fn(),
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
    getEmotionState: getEmotionStateMock,
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

const longCompressedSummary = `<summary>Awake snapshot was added. ${'A'.repeat(420)} LONG_TAIL_MARKER</summary>`
const currentVector = { valence: 6, arousal: 4, dominance: 5 }
const currentProjection = projectEmotionVector(currentVector)

describe('AwakeSnapshotService', () => {
  it('omits emotion context and skips state reads when disabled', async () => {
    const snapshot = await new AwakeSnapshotService().build({ chat, emotionEnabled: false })
    expect(snapshot).not.toHaveProperty('emotion')
    expect(snapshot).not.toHaveProperty('mood_notes')
    expect(getEmotionStateMock).not.toHaveBeenCalled()
    expect(snapshot.work_context).toBeDefined()
  })

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
    getEmotionStateMock.mockReturnValue({
      current: {
        vector: currentVector,
        label: currentProjection.label,
        intensity: currentProjection.intensity,
        updatedAt: 111
      },
      baseline: EMOTION_BASELINE_VECTOR,
      history: [{
        vector: currentVector,
        stimulus: { impact: 1, activation: 1, control: 0 },
        label: currentProjection.label,
        intensity: currentProjection.intensity,
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
        chat_title: 'Awake snapshot work',
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
    expect(snapshot.version).toBe(2)
    expect(snapshot).not.toHaveProperty('session_meta')
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
    expect(snapshot.emotion!.baseline).toEqual({
      label: 'neutral',
      intensity: 5,
      source: 'awake_carryover',
      vector: EMOTION_BASELINE_VECTOR
    })
    expect(snapshot.emotion!.current).toEqual({
      label: currentProjection.label,
      intensity: currentProjection.intensity,
      vector: currentVector
    })
    expect(snapshot.emotion!.summary).toContain(`Current emotion: ${currentProjection.label}`)
    expect(snapshot.emotion!.summary).toContain('Current VAD:')
    expect(snapshot.emotion!.baseline).not.toHaveProperty('updated_at')
    expect(snapshot.emotion!.recent_history[0]).toMatchObject({
      label: currentProjection.label,
      stimulus: { impact: 1, activation: 1, control: 0 }
    })
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
    expect(compressedActivity?.summary).toBe('Awake snapshot was added.')
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
    expect(snapshot.emotion!.current.label).toBe(currentProjection.label)
    expect(snapshot.emotion!.summary).toContain(`Current emotion: ${currentProjection.label}`)
  })

  it('keeps only the latest three title clues across dates and sources for a context-free greeting', async () => {
    getWorkContextByChatUuidMock.mockReturnValue(undefined)
    const entries = [500, 400, 300].map(timestamp => ({
      id: `entry-${timestamp}`, title: `Milestone ${timestamp}`, details: 'Unrelated task details.',
      category: 'task', level: 'info', createdAt: timestamp
    }))
    listActivityEntriesMock.mockResolvedValue(entries)
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([{
      id: 55, chat_uuid: 'other-chat', chat_title: 'Other recent task', summary: 'Unrelated summary.', compressed_at: 450
    }])
    const snapshot = await new AwakeSnapshotService().build({
      chat: { ...chat, title: 'NewChat' }, currentQuery: 'yo', workspacePath: '/workspaces/new-chat-7', emotionEnabled: false
    })
    expect(listActivityEntriesMock).toHaveBeenCalledWith({ limit: 3 })
    expect(searchActivityEntriesMock).not.toHaveBeenCalled()
    expect(snapshot.recent_activities.map(item => item.id)).toEqual(['entry-500', '55', 'entry-400'])
    for (const item of snapshot.recent_activities) {
      expect(Object.keys(item).sort()).toEqual(['date', 'id', 'source', 'title'])
    }
    expect(snapshot).not.toHaveProperty('work_context')
    expect(snapshot).not.toHaveProperty('session_meta')
    expect(snapshot.memories[0].content).toBe('用户偏好直接、低废话的工程讨论')
  })

  it('retains task continuity for a short continuation and rejects weak semantic hits', async () => {
    listActivityEntriesMock.mockResolvedValue([{
      id: 'unrelated', title: 'Other domain', details: 'Unrelated details.', createdAt: 900
    }])
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([])
    searchActivityEntriesMock.mockResolvedValue([
      { id: 'current', chatUuid: chat.uuid, title: 'Current task', details: 'Ready to implement.', createdAt: 100, similarity: 0.7 },
      { id: 'related', title: 'Related task', details: 'Relevant evidence.', createdAt: 800, similarity: 0.9 },
      { id: 'weak', title: 'Weak hit', details: 'Weak evidence.', createdAt: 1000, similarity: 0.59 }
    ])
    const snapshot = await new AwakeSnapshotService().build({ chat: { ...chat, title: 'NewChat' }, currentQuery: '继续' })
    expect(searchActivityEntriesMock).toHaveBeenCalledWith(expect.stringContaining('Implement awake state.'), { limit: 3, withinDays: 14 })
    expect(snapshot.work_context?.content).toContain('Implement awake state.')
    expect(snapshot.recent_activities.map(item => item.id)).toEqual(['current', 'related', 'unrelated'])
    expect(snapshot.recent_activities[0].summary).toBe('Ready to implement.')
    expect(snapshot.recent_activities[2]).not.toHaveProperty('summary')
  })

  it('preserves semantic ranking when a search hit duplicates a recent entry', async () => {
    listActivityEntriesMock.mockResolvedValue([
      { id: 'newer', title: 'Newer task', createdAt: 300 },
      { id: 'older', title: 'Older task', createdAt: 200 }
    ])
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([])
    searchActivityEntriesMock.mockResolvedValue([
      { id: 'newer', title: 'Newer task', createdAt: 300, similarity: 0.7 },
      { id: 'older', title: 'Older task', createdAt: 200, similarity: 0.9 }
    ])
    const snapshot = await new AwakeSnapshotService().build({ chat, currentQuery: 'Review repository ownership' })
    expect(snapshot.recent_activities.map(item => item.id)).toEqual(['older', 'newer'])
  })

  it('omits an overlong unsplittable summary instead of cutting an assertion in half', async () => {
    listActivityEntriesMock.mockResolvedValue([{
      id: 'long', chatUuid: chat.uuid, title: 'Current task', details: 'A'.repeat(300), createdAt: 1
    }])
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([])
    const snapshot = await new AwakeSnapshotService().build({ chat, currentQuery: '继续' })
    expect(JSON.parse(JSON.stringify(snapshot.recent_activities[0]))).not.toHaveProperty('summary')
  })

  it('uses compression context for continuation and preserves complete Chinese summary sentences', async () => {
    getWorkContextByChatUuidMock.mockReturnValue({ content: '# Work Context' })
    listActivityEntriesMock.mockResolvedValue([])
    searchActivityEntriesMock.mockResolvedValue([])
    listRecentSmartMessageCandidateSummariesMock.mockReturnValue([{
      id: 77, chat_uuid: 'other-chat', chat_title: '技能开关优化',
      summary: `已完成技能开关验证。${'还有一个需要进一步研究的问题'.repeat(20)}`, compressed_at: 10
    }])
    const snapshot = await new AwakeSnapshotService().build({
      chat: { ...chat, title: 'NewChat' }, currentQuery: '继续',
      compressionSummary: { summary: '继续优化技能开关' } as CompressedSummaryEntity
    })
    expect(searchActivityEntriesMock).toHaveBeenCalledWith(expect.stringContaining('继续优化技能开关'), expect.any(Object))
    expect(snapshot.recent_activities[0].summary).toBe('已完成技能开关验证。')
    expect(snapshot).not.toHaveProperty('work_context')
  })

  it('builds a usable snapshot when work context and both activity sources fail', async () => {
    getWorkContextByChatUuidMock.mockImplementationOnce(() => { throw new Error('Unavailable') })
    listActivityEntriesMock.mockRejectedValueOnce(new Error('Unavailable'))
    searchActivityEntriesMock.mockRejectedValueOnce(new Error('Unavailable'))
    listRecentSmartMessageCandidateSummariesMock.mockImplementationOnce(() => { throw new Error('Unavailable') })
    const snapshot = await new AwakeSnapshotService().build({ chat })
    expect(snapshot.recent_activities).toEqual([])
    expect(snapshot.memories.length).toBeGreaterThan(0)
    expect(snapshot).not.toHaveProperty('work_context')
  })
})
