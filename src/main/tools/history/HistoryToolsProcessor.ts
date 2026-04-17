import DatabaseService from '@main/db/DatabaseService'
import type { HistorySearchArgs, HistorySearchResponse } from '@tools/history/index.d'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10
const DEFAULT_WITHIN_DAYS = 3
const MAX_WITHIN_DAYS = 7

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT
  }

  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_LIMIT)
}

function clampWithinDays(withinDays?: number): number {
  if (!Number.isFinite(withinDays)) {
    return DEFAULT_WITHIN_DAYS
  }

  return Math.min(Math.max(Math.floor(withinDays as number), 1), MAX_WITHIN_DAYS)
}

function normalizeOptionalQuery(query?: string): string | undefined {
  if (typeof query !== 'string') {
    return undefined
  }

  const trimmed = query.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export async function processHistorySearch(
  args: HistorySearchArgs
): Promise<HistorySearchResponse> {
  try {
    const scope = args.scope === 'current_chat' ? 'current_chat' : 'all'
    const chatUuid = scope === 'current_chat' ? args.chat_uuid : undefined

    if (scope === 'current_chat' && !chatUuid) {
      return {
        success: false,
        count: 0,
        items: [],
        message: 'chat_uuid is required when scope=current_chat'
      }
    }

    const items = DatabaseService.searchHistory({
      query: normalizeOptionalQuery(args.query),
      limit: clampLimit(args.limit),
      scope,
      withinDays: clampWithinDays(args.withinDays),
      chat_uuid: chatUuid
    })

    return {
      success: true,
      count: items.length,
      items,
      message: items.length > 0
        ? `Found ${items.length} recent history matches.`
        : 'No recent history matches found.'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      count: 0,
      items: [],
      message: `Failed to search recent history: ${message}`
    }
  }
}
