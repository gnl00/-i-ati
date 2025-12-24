import { AlertCircle, ExternalLink, Search } from 'lucide-react'
import React from 'react'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious
} from '../ui/carousel'

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

export const WebSearchResults: React.FC<WebSearchResultsProps> = ({ results }) => {
  // 排序：成功的结果在前，失败的在后
  const sortedResults = [...results].sort((a, b) => {
    if (a.success && !b.success) return -1
    if (!a.success && b.success) return 1
    return 0
  })

  const successCount = results.filter((r) => r.success).length
  const totalCount = results.length

  return (
    <div className="space-y-1.5 px-2 my-1.5">
      {/* Header with search info */}
      <div className="flex items-center gap-2 px-0.5">
        <Search className="w-3 h-3 text-slate-500 dark:text-slate-400" />
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 select-none tracking-wider uppercase">
          Search Results
        </span>
        <div className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/50">
          {successCount}/{totalCount}
        </div>
      </div>

      {/* Results Carousel */}
      <Carousel
        opts={{
          align: 'start',
          containScroll: 'trimSnaps'
        }}
        className="w-full"
      >
        <CarouselContent className="-ml-1.5 pt-1.5">
          {sortedResults.map((result, idx) => (
            <CarouselItem key={idx} className="pl-1.5 basis-[60%] sm:basis-[28%] lg:basis-[18%]">
              <WebSearchResultCard
                result={result}
                index={results.findIndex((r) => r === result)}
              />
            </CarouselItem>
          ))}
        </CarouselContent>
        {results.length > 3 && (
          <>
            <CarouselPrevious className="hidden sm:flex -left-2 h-6 w-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm border-slate-200 dark:border-slate-800" />
            <CarouselNext className="hidden sm:flex -right-2 h-6 w-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm shadow-sm border-slate-200 dark:border-slate-800" />
          </>
        )}
      </Carousel>
    </div>
  )
}

interface WebSearchResultCardProps {
  result: WebSearchResult
  index: number
}

const WebSearchResultCard: React.FC<WebSearchResultCardProps> = ({ result, index }) => {
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
      <div className="h-full flex flex-col group relative rounded-lg p-2 border border-dashed transition-all duration-200 bg-stone-50/20 dark:bg-slate-800/20 border-stone-200 dark:border-slate-700/50 opacity-60 hover:opacity-90 grayscale-[0.8] hover:grayscale-0">
        {/* Index badge */}
        <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-stone-200 dark:bg-slate-700 text-stone-400 dark:text-slate-500 text-[8px] font-bold border border-white dark:border-slate-800">
          {index + 1}
        </div>

        <div className="flex items-center gap-1.5 mb-1 opacity-60">
          <div className="flex-shrink-0 w-3.5 h-3.5 rounded-sm overflow-hidden bg-stone-100 dark:bg-slate-800 flex items-center justify-center border border-stone-200/50 dark:border-slate-700/50">
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
      className="h-full flex flex-col group relative rounded-lg p-2 transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50 hover:border-blue-400/30 dark:hover:border-blue-500/30 bg-white dark:bg-slate-800/50"
    >
      {/* Index badge - 悬浮小数字 (更加低调) */}
      <div className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[8px] font-bold border border-white dark:border-slate-800 group-hover:bg-blue-500 group-hover:text-white transition-colors">
        {index + 1}
      </div>

      {/* Favicon & Source */}
      <div className="flex items-center gap-1.5 mb-1.5 overflow-hidden">
        <div className="flex-shrink-0 w-3.5 h-3.5 rounded-sm overflow-hidden bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-200/50 dark:border-slate-600/50">
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
        <h3 className="text-[11px] font-bold leading-tight line-clamp-2 text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {result.title || 'Untitled'}
          <ExternalLink className="inline-block w-2.5 h-2.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity align-text-top" />
        </h3>

        {result.snippet && (
          <p className="text-[10px] leading-snug line-clamp-2 text-slate-500 dark:text-slate-400 font-medium opacity-80">
            {result.snippet}
          </p>
        )}
      </div>
    </a>
  )
}
