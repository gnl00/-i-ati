import { chatDb } from '@main/db/chat'
import { stripChatSearchHighlights } from '@shared/search/chatSearchHighlights'
import type { HistorySearchArgs, HistorySearchResponse } from '@tools/history/index.d'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 10
const DEFAULT_WITHIN_DAYS = 3
const MAX_WITHIN_DAYS = 30

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

function normalizeOptionalQuery(query?: string[]): string[] | undefined {
  if (!Array.isArray(query)) {
    return undefined
  }

  const terms = query
    .map(item => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean)

  return terms.length > 0 ? terms : undefined
}

export async function processHistorySearch(
  args: HistorySearchArgs
): Promise<HistorySearchResponse> {
  try {
    const scope = args.scope === 'current_chat' ? 'current_chat' : 'all'
    const chatUuid = scope === 'current_chat' ? args.chat_uuid : undefined
    const rawQuery = (args as { query?: unknown }).query

    if (scope === 'current_chat' && !chatUuid) {
      return {
        success: false,
        count: 0,
        items: [],
        message: 'chat_uuid is required when scope=current_chat'
      }
    }

    if (rawQuery !== undefined && !Array.isArray(rawQuery)) {
      return {
        success: false,
        count: 0,
        items: [],
        message: 'query must be an array of keyword strings, for example ["呼和浩特", "Hohhot", "呼市"].'
      }
    }

    const normalizedQuery = Array.isArray(rawQuery)
      ? normalizeOptionalQuery(rawQuery)
      : undefined

    const items = chatDb.searchHistory({
      query: normalizedQuery,
      limit: clampLimit(args.limit),
      scope,
      withinDays: clampWithinDays(args.withinDays),
      chat_uuid: chatUuid
    }).map(item => ({
      ...item,
      snippet: stripChatSearchHighlights(item.snippet)
    }))

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
