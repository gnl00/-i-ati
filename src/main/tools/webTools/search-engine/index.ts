import { bingSearchEngine } from './bing'
import { googleSearchEngine } from './google'
import type { SearchEngineDefinition, SearchEngineId } from './types'

const SEARCH_ENGINE_MAP: Record<SearchEngineId, SearchEngineDefinition> = {
  bing: bingSearchEngine,
  google: googleSearchEngine
}

export function resolveSearchEngine(engine?: string): SearchEngineDefinition {
  if (!engine) return SEARCH_ENGINE_MAP.bing

  const normalized = engine.trim().toLowerCase()
  if (normalized === 'google') return SEARCH_ENGINE_MAP.google
  return SEARCH_ENGINE_MAP.bing
}

export type { SearchEngineDefinition, SearchEngineId, SearchResultItem } from './types'
