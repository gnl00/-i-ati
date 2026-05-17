import DatabaseService from '@main/db/DatabaseService'
import activityJournalService from '@main/services/activityJournal/ActivityJournalService'
import MemoryService from '@main/services/memory/MemoryService'
import type {
  AwakeMemoryItem,
  AwakeRecentActivity,
  AwakeRetrievalPlan,
  AwakeSnapshot
} from '@shared/awake'

type MemoryMetadata = Record<string, any> | undefined

type MemorySearchResult = Awaited<ReturnType<typeof MemoryService.searchMemories>>[number]
type MemoryListEntry = Awaited<ReturnType<typeof MemoryService.getAllMemories>>[number]
type ActivityJournalEntry = Awaited<ReturnType<typeof activityJournalService.listEntries>>[number]
type ActivityJournalSearchItem = Awaited<ReturnType<typeof activityJournalService.searchEntries>>[number]
type SmartMessageCandidateSummary = ReturnType<typeof DatabaseService.listRecentSmartMessageCandidateSummaries>[number]

export type BuildAwakeSnapshotInput = {
  chat: ChatEntity
  workspacePath?: string
  currentQuery?: string
  compressionSummary?: CompressedSummaryEntity | null
  now?: number
}

const DEFAULT_TOP_K = 5
const DEFAULT_THRESHOLD = 0.6
const PINNED_MEMORY_LIMIT = 3
const RELEVANT_MEMORY_LIMIT = 5
const RECENT_ACTIVITY_LIMIT = 5
const WORK_CONTEXT_LIMIT = 8 * 1024
const CONTEXT_SIGNAL_LIMIT = 8
const RECENT_SUMMARY_WINDOW_DAYS = 30

const EMPTY_WORK_CONTEXT = '# Work Context'

const PINNED_CATEGORIES = new Set([
  'preference',
  'workflow',
  'style',
  'constraint',
  'project'
])

const getMetadataString = (metadata: MemoryMetadata, key: string): string | undefined => {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const extractMemoryMetadata = (metadata: MemoryMetadata) => ({
  category: getMetadataString(metadata, 'category'),
  importance: getMetadataString(metadata, 'importance')
})

const toPinnedMemoryItem = (entry: MemoryListEntry): AwakeMemoryItem => {
  const metadata = extractMemoryMetadata(entry.metadata)
  return {
    id: entry.id,
    content: entry.context_origin,
    context_en: entry.context_en,
    timestamp: entry.timestamp,
    ...(metadata.category ? { category: metadata.category } : {}),
    ...(metadata.importance ? { importance: metadata.importance } : {}),
    chat_id: entry.chatId
  }
}

const toRelevantMemoryItem = (result: MemorySearchResult): AwakeMemoryItem => {
  const metadata = extractMemoryMetadata(result.entry.metadata)
  return {
    id: result.entry.id,
    content: result.entry.context_origin,
    context_en: result.entry.context_en,
    timestamp: result.entry.timestamp,
    similarity: Number(result.similarity.toFixed(4)),
    ...(metadata.category ? { category: metadata.category } : {}),
    ...(metadata.importance ? { importance: metadata.importance } : {}),
    chat_id: result.entry.chatId
  }
}

const isPinnedMemory = (entry: MemoryListEntry): boolean => {
  const category = getMetadataString(entry.metadata, 'category')
  const importance = getMetadataString(entry.metadata, 'importance')

  return importance === 'high' && Boolean(category && PINNED_CATEGORIES.has(category))
}

const scoreImportance = (importance: string | undefined): number => {
  switch (importance) {
    case 'high':
      return 0.25
    case 'medium':
      return 0.12
    case 'low':
      return 0.04
    default:
      return 0
  }
}

const scoreCategory = (category: string | undefined): number => (
  category && PINNED_CATEGORIES.has(category) ? 0.08 : 0
)

const dedupeRelevantMemories = (results: MemorySearchResult[]): AwakeMemoryItem[] => {
  const byId = new Map<string, AwakeMemoryItem & { rerank_score: number }>()

  for (const result of results) {
    const item = toRelevantMemoryItem(result)
    const rerankScore = (item.similarity ?? 0)
      + scoreImportance(item.importance)
      + scoreCategory(item.category)
      + (Date.now() - item.timestamp < 1000 * 60 * 60 * 24 * 30 ? 0.04 : 0)
    const existing = byId.get(item.id)

    if (!existing || existing.rerank_score < rerankScore) {
      byId.set(item.id, {
        ...item,
        rerank_score: rerankScore
      })
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => b.rerank_score - a.rerank_score)
    .slice(0, RELEVANT_MEMORY_LIMIT)
    .map(({ rerank_score: _rerankScore, ...item }) => item)
}

const toActivityItem = (
  entry: ActivityJournalEntry | ActivityJournalSearchItem
): AwakeRecentActivity => ({
  source: 'activity_journal',
  id: entry.id,
  title: entry.title,
  ...(entry.details ? { content: entry.details } : {}),
  category: entry.category,
  level: entry.level,
  ...(entry.chatUuid ? { chat_uuid: entry.chatUuid } : {}),
  timestamp: entry.createdAt
})

const toSummaryActivityItem = (summary: SmartMessageCandidateSummary): AwakeRecentActivity => ({
  source: 'compressed_summary',
  id: String(summary.id),
  title: summary.chat_title || `Chat ${summary.chat_uuid}`,
  content: summary.summary,
  chat_uuid: summary.chat_uuid,
  chat_title: summary.chat_title,
  timestamp: summary.compressed_at
})

const dedupeRecentActivities = (items: AwakeRecentActivity[]): AwakeRecentActivity[] => {
  const byKey = new Map<string, AwakeRecentActivity>()

  for (const item of items) {
    const key = `${item.source}:${item.id}`
    const existing = byKey.get(key)
    if (!existing || existing.timestamp < item.timestamp) {
      byKey.set(key, item)
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, RECENT_ACTIVITY_LIMIT)
}

const extractHeadingSection = (content: string, heading: string): string => {
  const pattern = new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'm')
  const match = content.match(pattern)
  return match?.[1]?.trim() || ''
}

const truncateLines = (value: string, maxLines: number): string => (
  value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n')
)

const summarizeWorkContextForQuery = (content: string | undefined): string => {
  if (!content) {
    return ''
  }

  const sections = [
    'Current Goal',
    'Decisions',
    'In Progress',
    'Temporary Constraints'
  ]

  return sections
    .map((section) => {
      const value = truncateLines(extractHeadingSection(content, section), 4)
      return value ? `${section}: ${value}` : ''
    })
    .filter(Boolean)
    .join('\n')
}

const truncateWorkContext = (content: string | undefined): {
  content: string
  truncated: boolean
} => {
  const normalized = content?.trim() || EMPTY_WORK_CONTEXT
  if (normalized.length <= WORK_CONTEXT_LIMIT) {
    return {
      content: normalized,
      truncated: false
    }
  }

  const summary = [
    '# Work Context',
    '',
    '## Current Goal',
    truncateLines(extractHeadingSection(normalized, 'Current Goal'), 8),
    '',
    '## Decisions',
    truncateLines(extractHeadingSection(normalized, 'Decisions'), 12),
    '',
    '## In Progress',
    truncateLines(extractHeadingSection(normalized, 'In Progress'), 12),
    '',
    '## Open Questions',
    truncateLines(extractHeadingSection(normalized, 'Open Questions'), 8),
    '',
    '## Temporary Constraints',
    truncateLines(extractHeadingSection(normalized, 'Temporary Constraints'), 8)
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    content: summary.slice(0, WORK_CONTEXT_LIMIT),
    truncated: true
  }
}

const extractSignals = (input: {
  currentQuery?: string
  chatTitle?: string
  workspacePath?: string
  workContextSummary?: string
  compressionSummary?: string
}): string[] => {
  const values = [
    input.currentQuery,
    input.chatTitle,
    input.workspacePath?.split(/[\\/]/).filter(Boolean).slice(-3).join('/'),
    input.workContextSummary,
    input.compressionSummary
  ]

  const tokens = new Set<string>()
  for (const value of values) {
    if (!value) continue
    const matches = value.match(/[@#]?[a-zA-Z0-9_.\-/]{3,}|[\u4e00-\u9fff]{2,}/g) ?? []
    for (const match of matches) {
      const normalized = match.trim()
      if (normalized.length >= 2) {
        tokens.add(normalized)
      }
      if (tokens.size >= CONTEXT_SIGNAL_LIMIT) {
        return Array.from(tokens)
      }
    }
  }

  return Array.from(tokens)
}

const buildContextualQuery = (input: {
  currentQuery?: string
  chatTitle?: string
  workspacePath?: string
  workContextSummary?: string
  compressionSummary?: string
  signals: string[]
}): string => {
  return [
    input.currentQuery?.trim(),
    input.chatTitle ? `Chat title: ${input.chatTitle}` : '',
    input.workspacePath ? `Workspace: ${input.workspacePath}` : '',
    input.workContextSummary ? `Work context:\n${input.workContextSummary}` : '',
    input.compressionSummary ? `Recent summary:\n${input.compressionSummary.slice(0, 1200)}` : '',
    input.signals.length ? `Signals: ${input.signals.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

const buildRetrievalPlan = (input: {
  currentQuery?: string
  chatTitle?: string
  workspacePath?: string
  workContextSummary?: string
  compressionSummary?: string
}): AwakeRetrievalPlan => {
  const rawQuery = input.currentQuery?.trim() || ''
  const signals = extractSignals(input)
  const contextualQuery = buildContextualQuery({
    ...input,
    signals
  }) || rawQuery
  const confidence = contextualQuery.length > rawQuery.length || signals.length >= 3
    ? 'medium'
    : rawQuery ? 'low' : 'low'

  return {
    raw_query: rawQuery,
    contextual_query: contextualQuery,
    signals,
    top_k: DEFAULT_TOP_K,
    threshold: DEFAULT_THRESHOLD,
    confidence
  }
}

const fallbackEmotion = (): AwakeSnapshot['emotion'] => ({
  baseline: {
    label: 'neutral',
    intensity: 5,
    source: 'awake_carryover'
  },
  accumulated: [],
  recent_history: []
})

const buildEmotionSnapshot = (state: EmotionStateSnapshot | undefined): AwakeSnapshot['emotion'] => {
  if (!state) {
    return fallbackEmotion()
  }

  return {
    baseline: {
      label: state.current.label,
      intensity: state.current.intensity,
      source: 'awake_carryover',
      updated_at: state.current.updatedAt
    },
    background: {
      label: state.background.label,
      intensity: state.background.intensity
    },
    accumulated: state.accumulated
      .slice()
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 5)
      .map(entry => ({
        label: entry.label,
        description: entry.description,
        intensity: entry.intensity,
        decay: entry.decay,
        updated_at: entry.updatedAt
      })),
    recent_history: state.history
      .slice(-3)
      .reverse()
      .map(entry => ({
        label: entry.label,
        intensity: entry.intensity,
        timestamp: entry.timestamp,
        source: entry.source
      }))
  }
}

export class AwakeSnapshotService {
  async build(input: BuildAwakeSnapshotInput): Promise<AwakeSnapshot> {
    const now = input.now ?? Date.now()
    let workContextContent: string | undefined
    let workContextExists = false

    try {
      const workContext = DatabaseService.getWorkContextByChatUuid(input.chat.uuid)
      workContextContent = workContext?.content
      workContextExists = Boolean(workContext)
    } catch {
      workContextContent = undefined
      workContextExists = false
    }

    const workContext = truncateWorkContext(workContextContent)
    const workContextSummary = summarizeWorkContextForQuery(workContextContent)
    const retrievalPlan = buildRetrievalPlan({
      currentQuery: input.currentQuery,
      chatTitle: input.chat.title,
      workspacePath: input.workspacePath,
      workContextSummary,
      compressionSummary: input.compressionSummary?.summary
    })

    const [memory, recentActivities] = await Promise.all([
      this.buildMemorySnapshot(input.chat.id, retrievalPlan),
      this.buildRecentActivities(retrievalPlan)
    ])
    const emotion = this.buildEmotion(input.chat.id)

    return {
      version: 1,
      generated_at: now,
      memory,
      work_context: {
        exists: workContextExists,
        content: workContext.content,
        truncated: workContext.truncated
      },
      emotion,
      mood_notes: [],
      recent_activities: recentActivities,
      session_meta: {
        chat_id: input.chat.id,
        chat_uuid: input.chat.uuid,
        chat_title: input.chat.title,
        last_active_at: input.chat.updateTime,
        workspace_path: input.workspacePath
      }
    }
  }

  private async buildMemorySnapshot(
    chatId: number | undefined,
    retrievalPlan: AwakeRetrievalPlan
  ): Promise<AwakeSnapshot['memory']> {
    try {
      const [allMemories, rawResults, contextualResults] = await Promise.all([
        MemoryService.getAllMemories(),
        retrievalPlan.raw_query
          ? MemoryService.searchMemories(retrievalPlan.raw_query, {
            chatId,
            topK: retrievalPlan.top_k,
            threshold: retrievalPlan.threshold
          })
          : Promise.resolve([]),
        retrievalPlan.contextual_query && retrievalPlan.contextual_query !== retrievalPlan.raw_query
          ? MemoryService.searchMemories(retrievalPlan.contextual_query, {
            chatId,
            topK: retrievalPlan.top_k,
            threshold: retrievalPlan.threshold
          })
          : Promise.resolve([])
      ])

      const pinnedPreferences = allMemories
        .filter(isPinnedMemory)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, PINNED_MEMORY_LIMIT)
        .map(toPinnedMemoryItem)

      return {
        pinned_preferences: pinnedPreferences,
        relevant_memories: dedupeRelevantMemories([
          ...rawResults,
          ...contextualResults
        ]),
        retrieval_plan: retrievalPlan
      }
    } catch {
      return {
        pinned_preferences: [],
        relevant_memories: [],
        retrieval_plan: retrievalPlan
      }
    }
  }

  private async buildRecentActivities(
    retrievalPlan: AwakeRetrievalPlan
  ): Promise<AwakeRecentActivity[]> {
    const items: AwakeRecentActivity[] = []

    const todayJournal = await this.safeListTodayJournal()
    items.push(...todayJournal.map(toActivityItem))

    const searchedJournal = await this.safeSearchJournal(retrievalPlan.contextual_query || retrievalPlan.raw_query)
    items.push(...searchedJournal.map(toActivityItem))

    const summaries = this.safeListRecentSummaries()
    items.push(...summaries.map(toSummaryActivityItem))

    return dedupeRecentActivities(items)
  }

  private async safeListTodayJournal(): Promise<ActivityJournalEntry[]> {
    try {
      return await activityJournalService.listEntries({
        dateKey: activityJournalService.getDateKey(),
        limit: RECENT_ACTIVITY_LIMIT
      })
    } catch {
      return []
    }
  }

  private async safeSearchJournal(query: string): Promise<ActivityJournalSearchItem[]> {
    if (!query.trim()) {
      return []
    }

    try {
      return await activityJournalService.searchEntries(query, {
        limit: RECENT_ACTIVITY_LIMIT,
        withinDays: 14
      })
    } catch {
      return []
    }
  }

  private safeListRecentSummaries(): SmartMessageCandidateSummary[] {
    try {
      return DatabaseService.listRecentSmartMessageCandidateSummaries(
        Date.now() - (RECENT_SUMMARY_WINDOW_DAYS * 86400000),
        RECENT_ACTIVITY_LIMIT
      )
    } catch {
      return []
    }
  }

  private buildEmotion(chatId: number | undefined): AwakeSnapshot['emotion'] {
    try {
      return buildEmotionSnapshot(
        chatId ? DatabaseService.getEmotionStateByChatId(chatId) : undefined
      )
    } catch {
      return fallbackEmotion()
    }
  }
}

export const awakeSnapshotService = new AwakeSnapshotService()
