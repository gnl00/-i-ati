export type SearchEngineId = 'bing' | 'google'

export interface SearchResultItem {
  link: string
  title: string
  snippet: string
}

export interface SearchEngineDefinition {
  id: SearchEngineId
  displayName: string
  buildSearchUrl: (query: string) => string
  waitForResultsScript: string
  buildExtractResultsScript: (count: number) => string
}
