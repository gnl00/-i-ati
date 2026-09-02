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

const longCompressedSummary = `<summary>${'A'.repeat(420)} LONG_TAIL_MARKER</summary>`
const currentVector = { valence: 6, arousal: 4, dominance: 5 }
const currentProjection = projectEmotionVector(currentVector)

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
      label: 'neutral',
      intensity: 5,
      source: 'awake_carryover',
      vector: EMOTION_BASELINE_VECTOR
    })
    expect(snapshot.emotion.current).toEqual({
      label: currentProjection.label,
      intensity: currentProjection.intensity,
      vector: currentVector
    })
    expect(snapshot.emotion.summary).toContain(`Current emotion: ${currentProjection.label}`)
    expect(snapshot.emotion.summary).toContain('Current VAD:')
    expect(snapshot.emotion.baseline).not.toHaveProperty('updated_at')
    expect(snapshot.emotion.recent_history[0]).toMatchObject({
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
    expect(snapshot.emotion.current.label).toBe(currentProjection.label)
    expect(snapshot.emotion.summary).toContain(`Current emotion: ${currentProjection.label}`)
  })
})
