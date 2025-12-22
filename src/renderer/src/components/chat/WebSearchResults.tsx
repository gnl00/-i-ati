import { AlertCircle, ExternalLink, Search } from 'lucide-react'
import React from 'react'
import { Badge } from '../ui/badge'

interface WebSearchResult {
  query: string
  success: boolean
  link: string
  title: string
  snippet: string
  content: string
  error?: string
}

interface WebSearchResultsProps {
  results: WebSearchResult[]
  isDarkMode: boolean
}

export const WebSearchResults: React.FC<WebSearchResultsProps> = ({ results, isDarkMode }) => {
  // 排序：成功的结果在前，失败的在后
  const sortedResults = [...results].sort((a, b) => {
    if (a.success && !b.success) return -1
    if (!a.success && b.success) return 1
    return 0
  })

  const successCount = results.filter(r => r.success).length
  const totalCount = results.length

  return (
    <div className="space-y-2 px-2">
      {/* Header with search info */}
      <div className="flex items-center gap-2 px-0.5 text-gray-400 dark:text-gray-500">
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs font-medium select-none">
          Found {successCount} of {totalCount} results
        </span>
      </div>

      {/* Results list */}
      <div className="space-y-1.5">
        {sortedResults.map((result, idx) => (
          <WebSearchResultCard
            key={idx}
            result={result}
            index={results.findIndex(r => r === result)}
            isDarkMode={isDarkMode}
          />
        ))}
      </div>
    </div>
  )
}

interface WebSearchResultCardProps {
  result: WebSearchResult
  index: number
  isDarkMode: boolean
}

const WebSearchResultCard: React.FC<WebSearchResultCardProps> = ({ result, index, isDarkMode }) => {
  if (!result.success) {
    return (
      <div className="group relative rounded-lg p-2.5 px-2 border transition-shadow duration-200 hover:shadow-md bg-stone-100 dark:bg-slate-800 border-stone-200 dark:border-slate-700">
        <div className="flex items-start gap-2.5">
          <div className="flex-shrink-0 mt-0.5">
            <AlertCircle className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium mb-0.5 text-stone-700 dark:text-stone-300">
              Failed to load result
            </div>
            <div className="text-xs truncate opacity-70 font-mono text-stone-600 dark:text-stone-400">
              {new URL(result.link).hostname}
            </div>
            {result.error && (
              <div className="text-xs mt-1.5 font-mono opacity-60 text-stone-600 dark:text-stone-400">
                {result.error}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <a
      href={result.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block rounded-lg p-2.5 transition-shadow duration-200 hover:shadow bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700"
    >
      {/* Index badge - 精致小徽章 */}
      <Badge
        variant="outline"
        className="absolute -top-1.5 -left-1.5 h-5 w-5 p-0 rounded-full flex items-center justify-center shadow-sm border-[1.5px] bg-slate-300 dark:bg-purple-800 border-stone-50 dark:border-slate-800 text-stone-50 text-[9px] font-medium"
      >
        {index + 1}
      </Badge>

      {/* Content */}
      <div className="space-y-1">
        {/* Title with inline Visit indicator */}
        <div className="flex items-start gap-1.5 pr-1">
          <h3 className="text-xs font-medium line-clamp-2 flex-1 leading-relaxed text-slate-800 dark:text-stone-100">
            {result.title || 'Untitled'}
            <ExternalLink className="inline-block w-3 h-3 ml-1 opacity-40 group-hover:opacity-70 transition-opacity text-slate-800 dark:text-stone-100" />
          </h3>
        </div>

        {/* Snippet - single line */}
        {result.snippet && (
          <p className="text-xs leading-relaxed line-clamp-1 pl-0.5 text-stone-600 dark:text-stone-400">
            {result.snippet}
          </p>
        )}
      </div>
    </a>
  )
}
