import activityJournalService from '@main/services/activityJournal/ActivityJournalService'
import DatabaseService from '@main/services/DatabaseService'
import type {
  ActivityJournalAppendResponse,
  ActivityJournalCategory,
  ActivityJournalLevel,
  ActivityJournalListResponse,
  ActivityJournalSearchResponse
} from '@tools/activityJournal/index.d'

type ActivityJournalAppendArgs = {
  title: string
  details?: string
  category: ActivityJournalCategory
  level?: ActivityJournalLevel
  tags?: string[]
  chat_uuid?: string
}

type ActivityJournalListArgs = {
  date?: string
  limit?: number
  scope?: 'all' | 'current_chat'
  chat_uuid?: string
}

type ActivityJournalSearchArgs = {
  query: string
  limit?: number
  scope?: 'all' | 'current_chat'
  withinDays?: number
  chat_uuid?: string
}

const VALID_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 50
  return Math.min(Math.max(Math.floor(limit as number), 1), 200)
}

function clampSearchLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 10
  return Math.min(Math.max(Math.floor(limit as number), 1), 50)
}

function clampWithinDays(value?: number): number {
  if (!Number.isFinite(value)) return 7
  return Math.min(Math.max(Math.floor(value as number), 1), 90)
}

export async function processActivityJournalAppend(
  args: ActivityJournalAppendArgs
): Promise<ActivityJournalAppendResponse> {
  try {
    if (!args.chat_uuid) {
      return {
        success: false,
        indexed: false,
        message: 'chat_uuid is required'
      }
    }

    const title = args.title?.trim()
    if (!title) {
      return {
        success: false,
        indexed: false,
        message: 'title is required'
      }
    }

    const chat = DatabaseService.getChatByUuid(args.chat_uuid)
    const result = await activityJournalService.appendEntry({
      chatUuid: args.chat_uuid,
      chatId: chat?.id,
      title,
      details: args.details,
      category: args.category,
      level: args.level,
      tags: args.tags
    })

    return {
      success: true,
      entry: result.entry,
      indexed: result.indexed,
      message: result.indexed
        ? 'Activity journal entry appended and indexed.'
        : 'Activity journal entry appended.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      indexed: false,
      message: `Failed to append activity journal entry: ${message}`
    }
  }
}

export async function processActivityJournalList(
  args: ActivityJournalListArgs = {}
): Promise<ActivityJournalListResponse> {
  try {
    const date = args.date?.trim() || activityJournalService.getDateKey()
    if (!VALID_DATE_PATTERN.test(date)) {
      return {
        success: false,
        date,
        count: 0,
        entries: [],
        message: 'date must be in YYYY-MM-DD format'
      }
    }

    const limit = clampLimit(args.limit)
    const chatUuid = args.scope === 'current_chat' ? args.chat_uuid : undefined

    if (args.scope === 'current_chat' && !chatUuid) {
      return {
        success: false,
        date,
        count: 0,
        entries: [],
        message: 'chat_uuid is required when scope=current_chat'
      }
    }

    const entries = await activityJournalService.listEntries({
      dateKey: date,
      limit,
      chatUuid
    })

    return {
      success: true,
      date,
      count: entries.length,
      entries,
      message: entries.length > 0
        ? `Found ${entries.length} activity journal entries.`
        : 'No activity journal entries found.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      date: args.date?.trim() || activityJournalService.getDateKey(),
      count: 0,
      entries: [],
      message: `Failed to list activity journal entries: ${message}`
    }
  }
}

export async function processActivityJournalSearch(
  args: ActivityJournalSearchArgs
): Promise<ActivityJournalSearchResponse> {
  try {
    const query = args.query?.trim()
    if (!query) {
      return {
        success: false,
        count: 0,
        entries: [],
        message: 'query is required'
      }
    }

    const chatUuid = args.scope === 'current_chat' ? args.chat_uuid : undefined
    if (args.scope === 'current_chat' && !chatUuid) {
      return {
        success: false,
        count: 0,
        entries: [],
        message: 'chat_uuid is required when scope=current_chat'
      }
    }

    const entries = await activityJournalService.searchEntries(query, {
      limit: clampSearchLimit(args.limit),
      withinDays: clampWithinDays(args.withinDays),
      chatUuid
    })

    return {
      success: true,
      count: entries.length,
      entries,
      message: entries.length > 0
        ? `Found ${entries.length} matching activity journal entries.`
        : 'No matching activity journal entries found.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      count: 0,
      entries: [],
      message: `Failed to search activity journal entries: ${message}`
    }
  }
}
