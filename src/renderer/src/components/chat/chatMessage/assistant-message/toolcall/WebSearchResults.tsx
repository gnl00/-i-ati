import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink, Search } from 'lucide-react'
import React, { useMemo } from 'react'
import { cn } from '@renderer/lib/utils'

const SEARCH_RESULT_RAIL_SCROLL_RATIO = 0.72
const SEARCH_RESULT_RAIL_MIN_SCROLL = 220

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
}

// Memoize the component to prevent unnecessary re-renders
export const WebSearchResults: React.FC<WebSearchResultsProps> = React.memo(({ results }) => {
  // Memoize sorted results to avoid re-sorting on every render
  // console.log('results', results);

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.success && !b.success) return -1
      if (!a.success && b.success) return 1
      return 0
    })
  }, [results])

  // Memoize counts to avoid re-filtering on every render
  const { successCount, totalCount } = useMemo(() => {
    return {
      successCount: results.filter((r) => r.success).length,
      totalCount: results.length
    }
  }, [results])

  return (
    <div className="space-y-1 px-1 my-0.5">
      {/* Header with search info */}
      <div className="flex items-center gap-2 px-0.5">
        <Search className="w-3 h-3 text-slate-500 dark:text-slate-400" />
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 select-none tracking-wider uppercase">
          {
            results.length === 0
              ? 'No Results'
              : `${results[0].query}`
          }
        </span>
        <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/50">
          {successCount}/{totalCount}
        </div>
      </div>

      {
        results.length !== 0 && (
          <SearchResultRail
            results={sortedResults}
            getOriginalIndex={(result) => results.findIndex((r) => r === result)}
          />
        )
      }
    </div>
  )
})

interface SearchResultRailProps {
  results: WebSearchResult[]
  getOriginalIndex: (result: WebSearchResult) => number
}

const SearchResultRail: React.FC<SearchResultRailProps> = React.memo(({ results, getOriginalIndex }) => {
  const railRef = React.useRef<HTMLDivElement>(null)
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const updateScrollState = React.useCallback(() => {
    const rail = railRef.current

    if (!rail) {
      setCanScrollPrev(false)
      setCanScrollNext(false)
      return
    }

    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0)
    setCanScrollPrev(rail.scrollLeft > 1)
    setCanScrollNext(rail.scrollLeft < maxScrollLeft - 1)
  }, [])

  React.useEffect(() => {
    const rail = railRef.current

    updateScrollState()

    if (!rail) {
      return
    }

    rail.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)

    const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(rail)

    return () => {
      rail.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [results.length, updateScrollState])

  const scrollByPage = React.useCallback((direction: -1 | 1) => {
    const rail = railRef.current

    if (!rail) {
      return
    }

    const scrollAmount = Math.max(
      rail.clientWidth * SEARCH_RESULT_RAIL_SCROLL_RATIO,
      SEARCH_RESULT_RAIL_MIN_SCROLL
    )
    rail.scrollBy({
      left: direction * scrollAmount,
      behavior: 'smooth'
    })
    window.requestAnimationFrame(updateScrollState)
  }, [updateScrollState])

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    if (event.cancelable) {
      event.preventDefault()
    }

    event.currentTarget.scrollLeft += event.deltaY
    updateScrollState()
  }, [updateScrollState])

  return (
    <div className="relative w-full" data-testid="web-search-results-rail">
      <div
        ref={railRef}
        className="flex snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-smooth overscroll-x-contain pt-1.5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={handleWheel}
      >
        {results.map((result, idx) => (
          <div key={idx} className="w-[60%] shrink-0 snap-start sm:w-[28%] lg:w-[18%]">
            <WebSearchResultCard
              result={result}
              index={getOriginalIndex(result)}
            />
          </div>
        ))}
      </div>

      {results.length > 3 && (
        <>
          <button
            type="button"
            aria-label="Scroll web search results left"
            disabled={!canScrollPrev}
            className="app-undragable absolute -left-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 shadow-xs backdrop-blur-xs transition-[background-color,border-color,color,opacity,box-shadow] duration-150 hover:border-slate-300 hover:bg-white hover:text-slate-700 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:opacity-0 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200 sm:flex"
            onClick={() => scrollByPage(-1)}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Scroll web search results right"
            disabled={!canScrollNext}
            className="app-undragable absolute -right-2 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 shadow-xs backdrop-blur-xs transition-[background-color,border-color,color,opacity,box-shadow] duration-150 hover:border-slate-300 hover:bg-white hover:text-slate-700 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:opacity-0 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200 sm:flex"
            onClick={() => scrollByPage(1)}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
})

interface WebSearchResultCardProps {
  result: WebSearchResult
  index: number
}

// Memoize the card component to prevent unnecessary re-renders
const WebSearchResultCard: React.FC<WebSearchResultCardProps> = React.memo(({ result, index }) => {
  const getFaviconUrl = (url: string) => {
    try {
      const hostname = new URL(url).hostname
      // Use Favicon.im for better reliability and network compatibility
      return `https://favicon.im/${hostname}?larger=true`
    } catch (e) {
      return null
    }
  }

  const hostname = React.useMemo(() => {
    try {
      return new URL(result.link).hostname.replace('www.', '')
    } catch (e) {
      return 'link'
    }
  }, [result.link])

  if (!result.success) {
    return (
      <div className="h-full flex flex-col group/webcard relative rounded-lg p-2 border border-dashed transition-all duration-200 bg-stone-50/20 dark:bg-slate-800/20 border-stone-200 dark:border-slate-700/50 opacity-60 hover:opacity-90 grayscale-[0.8] hover:grayscale-0">
        {/* Index badge */}
        <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-stone-200 dark:bg-slate-700 text-stone-400 dark:text-slate-500 text-[8px] font-bold border border-white dark:border-slate-800">
          {index + 1}
        </div>

        <div className="flex items-center gap-1.5 mb-1 opacity-60">
          <div className="shrink-0 w-3.5 h-3.5 rounded-sm overflow-hidden bg-stone-100 dark:bg-slate-800 flex items-center justify-center border border-stone-200/50 dark:border-slate-700/50">
            <img
              src={getFaviconUrl(result.link) || ''}
              alt=""
              className="w-2.5 h-2.5 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                const icon = document.createElement('div')
                icon.innerHTML = `<svg viewBox="0 0 24 24" width="8" height="8" stroke="currentColor" stroke-width="2" fill="none" class="text-stone-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
                e.currentTarget.parentElement?.appendChild(icon.firstChild as Node)
              }}
            />
          </div>
          <span className="text-[9px] font-bold text-stone-400 dark:text-slate-500 uppercase tracking-tight truncate select-none">
            {hostname}
          </span>
        </div>

        <div className="flex items-start gap-1.5 min-w-0 flex-1">
          <AlertCircle className="w-2.5 h-2.5 text-stone-300 dark:text-slate-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-medium text-stone-400 dark:text-slate-500 line-clamp-1 italic">
              ERROR
            </div>
            {result.error && (
              <div className="text-[9px] mt-0.5 font-mono text-stone-400 dark:text-slate-600 line-clamp-2 break-all opacity-80 leading-tight">
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
      className="h-full flex flex-col group/webcard relative rounded-lg p-2 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 hover:border-blue-400/30 dark:hover:border-blue-500/30 bg-white dark:bg-slate-800/50"
    >
      {/* Index badge - 悬浮小数字 (更加低调) */}
      <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[8px] font-bold border border-white dark:border-slate-800 group-hover/webcard:bg-blue-500 group-hover/webcard:text-white transition-colors">
        {index + 1}
      </div>

      {/* Favicon & Source */}
      <div className="flex items-center gap-1.5 mb-1.5 overflow-hidden">
        <div className="shrink-0 w-3.5 h-3.5 rounded-sm overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200/50 dark:border-slate-600/50">
          <img
            src={getFaviconUrl(result.link) || ''}
            alt=""
            className="w-2.5 h-2.5 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const icon = document.createElement('div')
              icon.innerHTML = `<svg viewBox="0 0 24 24" width="8" height="8" stroke="currentColor" stroke-width="2" fill="none" class="text-slate-400"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`
              e.currentTarget.parentElement?.appendChild(icon.firstChild as Node)
            }}
          />
        </div>
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight truncate">
          {hostname}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-1">
        <h3 className={cn(
          "text-[11px] font-bold leading-tight line-clamp-2 text-slate-700 dark:text-slate-200 group-hover/webcard:text-blue-600 dark:group-hover/webcard:text-blue-400 transition-colors"
        )}>
          {result.title || 'Untitled'}
          <ExternalLink className="inline-block w-2.5 h-2.5 ml-1 opacity-0 group-hover/webcard:opacity-100 transition-opacity align-text-top" />
        </h3>

        {result.snippet && (
          <p className="text-[10px] leading-snug line-clamp-2 text-slate-500 dark:text-slate-400 font-medium opacity-80">
            {result.snippet}
          </p>
        )}
      </div>
    </a>
  )
})
