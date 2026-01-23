import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight';
import { Button } from '@renderer/components/ui/button';
import { cn } from '@renderer/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clipboard, Loader2, Wrench, X } from "lucide-react";
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WebSearchResults } from './WebSearchResults';

interface ToolCallResultProps {
  toolCall: ToolCallSegment
  index: number
  isDarkMode: boolean
}

// Memoize the component to prevent unnecessary re-renders
export const ToolCallResult: React.FC<ToolCallResultProps> = React.memo(({ toolCall: tc, isDarkMode }) => {
  const [isOpen, setIsOpen] = useState(false);

  // 检测是否为 Web Search 结果
  const isWebSearch = tc.name === 'web_search'
  const webSearchData = isWebSearch && tc.content?.results ? tc.content : null
  const isError = tc.isError;
  const status = typeof tc.content?.status === 'string' ? tc.content.status : undefined
  const isRunning = !isError && status === 'running'
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const jsonLineThreshold = 24;
  const contentCharThreshold = 1500;

  // Memoize JSON stringification
  const contentString = useMemo(() => {
    return typeof tc.content?.content === 'string' ? tc.content.content : ''
  }, [tc.content])

  const contentLineCount = useMemo(() => {
    return contentString ? contentString.split('\n').length : 0
  }, [contentString])

  const isContentLong = contentLineCount > jsonLineThreshold || contentString.length > contentCharThreshold

  const jsonBaseContent = useMemo(() => {
    if (!isJsonExpanded && isContentLong && tc.content && typeof tc.content === 'object') {
      const preview = contentString
        ? `${contentString.slice(0, contentCharThreshold)}${contentString.length > contentCharThreshold ? '...' : ''}`
        : contentString
      return JSON.stringify({ ...(tc.content as Record<string, unknown>), content: preview }, null, 2)
    }
    return JSON.stringify(tc.content, null, 2)
  }, [tc.content, isJsonExpanded, isContentLong, contentString])

  const jsonLines = useMemo(() => jsonBaseContent.split('\n'), [jsonBaseContent])
  const isJsonLong = isContentLong || jsonLines.length > jsonLineThreshold
  const visibleJsonContent = isJsonLong && !isJsonExpanded
    ? jsonLines.slice(0, jsonLineThreshold).join('\n')
    : jsonBaseContent

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation();
    const text = typeof content === 'string' ? content : jsonContent;
    navigator.clipboard.writeText(text);
    toast.success('Result Copied');
  }

  const toggleJsonExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsJsonExpanded(prev => !prev);
  }

  const toggleOpen = () => setIsOpen(!isOpen);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 30
      }}
      className='my-3 w-full max-w-full font-sans'
    >
      <div className={cn(
        "group relative flex flex-col transition-all",
        isOpen ? "gap-2" : "gap-0"
      )}>
        {/* Inline Log Row */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 w-fit">
          <span className={cn(
            "inline-flex items-center gap-1.5 px-1.5 py-1 rounded-full text-[10px] font-semibold leading-none",
            isError
              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
              : isRunning
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          )}>
            {isError
              ? <X className="w-2.5 h-2.5" />
              : isRunning
                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                : <Check className="w-2.5 h-2.5" />
            }
            {isError ? 'ERR' : isRunning ? 'RUNNING' : 'OK'}
          </span>

          <div className="flex items-center gap-1.5">
            <Wrench className="w-3 h-3 text-zinc-400/70 dark:text-zinc-500/70" />
            <span className={cn(
              "font-mono text-[11px] font-semibold tracking-tight leading-none",
              isError ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-zinc-200"
            )}>
              {tc.name}
            </span>
          </div>

          {tc.cost && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/80 dark:bg-zinc-900/40 border border-zinc-200/70 dark:border-zinc-800/60">
              {(tc.cost / 1000).toFixed(3)}s
            </span>
          )}

          <button
            type="button"
            onClick={toggleOpen}
            className={cn(
              "h-6 w-6 inline-flex items-center justify-center rounded-full",
              "text-zinc-500 dark:text-zinc-400",
              "hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60",
              "transition-all duration-200"
            )}
            aria-label={isOpen ? 'Hide Result' : 'View Result'}
          >
            <ChevronDown className={cn(
              "w-3 h-3 transition-transform duration-300",
              isOpen && "rotate-180 text-zinc-600 dark:text-zinc-300"
            )} />
          </button>
        </div>

        {/* Data Log Content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 2 }}
              transition={{
                duration: 0.3,
                ease: "circOut"
              }}
              exit={{
                height: 0,
                opacity: 0,
                marginTop: 0,
                transition: {
                  duration: 0.2,
                  ease: "easeInOut"
                }
              }}
              className="overflow-hidden"
            >
              <div className={cn(
                "relative rounded-xl overflow-hidden border",
                "shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
                isError
                  ? "bg-red-50/20 dark:bg-red-950/20 border-red-100/80 dark:border-red-900/40"
                  : "bg-white/70 dark:bg-black/30 border-zinc-200/70 dark:border-zinc-800/70"
              )}>
                <div className={cn(
                  "absolute inset-0 pointer-events-none",
                  "bg-linear-to-b from-white/60 via-transparent to-white/40",
                  "dark:from-black/40 dark:to-black/60"
                )} />

                {isWebSearch && webSearchData ? (
                  <div className="p-3 bg-zinc-50/80 dark:bg-zinc-900/60">
                    <WebSearchResults results={webSearchData.results} />
                  </div>
                ) : (
                  <>
                    {/* Technical Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-50/80 dark:bg-zinc-900/80 border-b border-zinc-100 dark:border-zinc-800 backdrop-blur-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-full" />
                        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          Output Payload
                        </span>
                        {isJsonLong && (
                          <button
                            type="button"
                            onClick={toggleJsonExpand}
                            className="text-[9px] font-semibold text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                          >
                            {isJsonExpanded
                              ? 'Collapse'
                              : isContentLong && contentLineCount > 0
                                ? `Expand content (${contentLineCount})`
                                : `Expand (${jsonLines.length}) lines`}
                          </button>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-sm transition-all"
                        onClick={(e) => onCopyClick(e, tc.content)}
                      >
                        <Clipboard className="w-2.5 h-2.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300" />
                      </Button>
                    </div>

                    {/* Code Block */}
                    <div className="max-h-64 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#09090b]">
                      <SpeedCodeHighlight
                        code={visibleJsonContent}
                        language="json"
                        isDarkMode={isDarkMode}
                      /* Passing style via props not supported, relying on SpeedCodeHighlight's internal style. 
                         Ideally would refactor SpeedCodeHighlight to accept style or className properly.
                         For now, the container handles most layout. */
                      />
                    </div>
                    {isJsonLong && !isJsonExpanded && (
                      <div className="px-3 py-2 text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/80">
                        Showing a preview. Use “Expand” to view full content.
                      </div>
                    )}
                    {/* Footer Decoration */}
                    <div className="h-1 w-full bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800" />
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});
