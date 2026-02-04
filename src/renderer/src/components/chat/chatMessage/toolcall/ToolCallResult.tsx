import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight';
import { Button } from '@renderer/components/ui/button';
import { Switch } from '@renderer/components/ui/switch';
import { cn } from '@renderer/lib/utils';
import { motion } from 'framer-motion';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { Check, ChevronDown, Clipboard, Loader2, Wrench, X } from "lucide-react";
import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { WebSearchResults } from './WebSearchResults';

interface ToolCallResultProps {
  toolCall: ToolCallSegment
  index: number
}

// Memoize the component to prevent unnecessary re-renders
export const ToolCallResult: React.FC<ToolCallResultProps> = React.memo(({ toolCall: tc, index }) => {
  const [openItem, setOpenItem] = useState<string>('');
  const [showDetails, setShowDetails] = useState(false);

  const toolResponse = tc.content as {
    toolName?: string
    args?: Record<string, unknown> | string
    result?: any
    status?: string
    error?: string
    raw?: any
  } | undefined

  const resultPayload = toolResponse?.result ?? toolResponse?.raw
  // 检测是否为 Web Search 结果
  const isWebSearch = (toolResponse?.toolName ?? tc.name) === 'web_search'
  const webSearchData = isWebSearch && resultPayload?.results ? resultPayload : null
  const toolName = toolResponse?.toolName ?? tc.name
  const isError = tc.isError;
  const status = typeof toolResponse?.status === 'string' ? toolResponse.status : undefined
  const isRunning = !isError && status === 'running'
  const [isJsonExpanded, setIsJsonExpanded] = useState(false);
  const jsonLineThreshold = 24;
  const contentCharThreshold = 1500;

  const formatValue = (value: unknown) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') {
      return value.length > 200 ? `${value.slice(0, 200)}…` : value
    }
    try {
      const json = JSON.stringify(value)
      return json.length > 200 ? `${json.slice(0, 200)}…` : json
    } catch {
      return String(value)
    }
  }

  const paramEntries = useMemo(() => {
    const args = toolResponse?.args
    if (!args || typeof args === 'string') return []
    return Object.entries(args)
  }, [toolResponse?.args])


  // Memoize JSON stringification
  const contentString = useMemo(() => {
    return typeof resultPayload?.content === 'string' ? resultPayload.content : ''
  }, [resultPayload])

  const contentLineCount = useMemo(() => {
    return contentString ? contentString.split('\n').length : 0
  }, [contentString])


  const isContentLong = contentLineCount > jsonLineThreshold || contentString.length > contentCharThreshold

  const jsonBaseContent = useMemo(() => {
    if (!isJsonExpanded && isContentLong && resultPayload && typeof resultPayload === 'object') {
      const preview = contentString
        ? `${contentString.slice(0, contentCharThreshold)}${contentString.length > contentCharThreshold ? '...' : ''}`
        : contentString
      return JSON.stringify({ ...(resultPayload as Record<string, unknown>), content: preview }, null, 2)
    }
    return JSON.stringify(resultPayload ?? toolResponse, null, 2)
  }, [resultPayload, toolResponse, isJsonExpanded, isContentLong, contentString])

  const jsonLines = useMemo(() => jsonBaseContent.split('\n'), [jsonBaseContent])
  const isJsonLong = isContentLong || jsonLines.length > jsonLineThreshold
  const visibleJsonContent = isJsonLong && !isJsonExpanded
    ? jsonLines.slice(0, jsonLineThreshold).join('\n')
    : jsonBaseContent

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation();
    const text = typeof content === 'string' ? content : visibleJsonContent;
    navigator.clipboard.writeText(text);
    toast.success('Result Copied');
  }

  const isOpen = openItem === 'tool-result';

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
      <Accordion
        type="single"
        collapsible
        value={openItem}
        onValueChange={setOpenItem}
        className="group relative flex flex-col transition-all"
      >
        <AccordionItem value="tool-result" className="border-0">
          <AccordionTrigger className="hover:no-underline py-0">
            <div className={cn(
              "flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 w-fit"
            )}>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-1.5 py-1 rounded-full text-[10px] font-semibold leading-none",
                isError
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : isRunning
                    ? "bg-amber-100 text-amber-500 dark:bg-amber-900/30 dark:text-amber-200"
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
                <Wrench className={cn(
                  "w-3 h-3 text-zinc-400/70 dark:text-zinc-500/70 transition-all duration-300",
                  isOpen && "scale-110 rotate-6"
                )} />
                <span className={cn(
                  "text-[11px] font-semibold tracking-tight leading-none uppercase",
                  isError ? "text-red-700 dark:text-red-300" : "text-slate-500 dark:text-slate-400"
                )}>
                  {tc.name}
                </span>
              </div>

              {tc.cost ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/80 dark:bg-zinc-900/40 select-none">
                  {(tc.cost / 1000).toFixed(3)}s
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/80 dark:bg-zinc-900/40 select-none">
                  0.000s
                </span>
              )
            }

              <ChevronDown className={cn(
                "w-3 h-3 transition-transform duration-300 text-zinc-500 dark:text-zinc-400",
                isOpen && "rotate-180 text-zinc-600 dark:text-zinc-300"
              )} />
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-0 pb-0">

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.2,
                ease: "easeOut"
              }}
              className="overflow-hidden mt-2"
            >
              <div className={cn(
                "relative rounded-xl overflow-hidden border border-b",
                "shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
                isError
                  ? "bg-red-50/20 dark:bg-red-950/20 border-red-100/80 dark:border-red-900/40"
                  : "bg-slate-50/70 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-800/70"
              )}>

                {isWebSearch && webSearchData ? (
                  <div className="p-3 bg-slate-100/80 dark:bg-slate-900/70">
                    <WebSearchResults results={webSearchData.results} />
                  </div>
                ) : (
                  <>
                    {/* Technical Header */}
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200/70 dark:border-slate-800 backdrop-blur-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full" />
                        <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                          Output Payload
                        </span>
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[9px] font-semibold text-zinc-400">Summary</span>
                          <Switch
                            checked={showDetails}
                            onCheckedChange={(checked) => setShowDetails(Boolean(checked))}
                            className="h-3.5 w-6 border border-zinc-200/80 bg-transparent dark:bg-gray-500 data-[state=checked]:bg-zinc-800/80 data-[state=unchecked]:bg-transparent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:translate-x-px data-[state=checked]:[&>span]:translate-x-[12px]"
                          />
                          <span className="text-[9px] font-semibold text-zinc-500">Detail</span>
                        </div>
                        {isJsonLong && showDetails && (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[9px] font-semibold text-zinc-400">Short</span>
                            <Switch
                              checked={isJsonExpanded}
                              onCheckedChange={(checked) => setIsJsonExpanded(Boolean(checked))}
                              className="h-3.5 w-6 border border-zinc-200/80 bg-transparent data-[state=checked]:bg-zinc-800/80 data-[state=unchecked]:bg-transparent [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:translate-x-[1px] data-[state=checked]:[&>span]:translate-x-[12px]"
                            />
                            <span className="text-[9px] font-semibold text-zinc-500">
                              {isContentLong && contentLineCount > 0
                                ? `Full (${contentLineCount})`
                                : `Full (${jsonLines.length})`}
                            </span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-sm transition-all"
                        onClick={(e) => onCopyClick(e, tc.content)}
                      >
                        <Clipboard className="w-2.5 h-2.5 text-zinc-400 hover:text-slate-700 dark:hover:text-slate-300" />
                      </Button>
                    </div>

                    {showDetails ? (
                      <>
                        {/* Code Block */}
                        <div className="relative">
                          <div
                            className="max-h-64 overflow-y-auto custom-scrollbar w-full bg-white dark:bg-[#09090b] overscroll-contain pb-7"
                            onWheel={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                          >
                            <SpeedCodeHighlight
                              code={visibleJsonContent}
                              language="json"
                              themeOverride="github-dim"
                            /* Passing style via props not supported, relying on SpeedCodeHighlight's internal style. 
                               Ideally would refactor SpeedCodeHighlight to accept style or className properly.
                               For now, the container handles most layout. */
                            />
                          </div>
                          <div
                            className={cn(
                              "absolute bottom-0 left-0 right-0 px-3 py-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-slate-200/70 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-xs transition-opacity duration-150",
                              isJsonLong && !isJsonExpanded
                                ? "opacity-100"
                                : "opacity-0 pointer-events-none"
                            )}
                          >
                            Showing a preview. Toggle “Full” to view all content.
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="px-3 py-2.5">
                        {/* Info Row - Compact */}
                        <div className="flex items-center gap-4 mb-2.5 pb-2 border-b border-zinc-200/50 dark:border-zinc-700/40">
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tool</span>
                            <span className="text-[13px] font-mono font-semibold text-zinc-500 dark:text-zinc-100">{toolResponse?.toolName ?? tc.name}</span>
                          </div>
                          {typeof tc.cost === 'number' && (
                            <div className="flex items-baseline gap-1">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Duration</span>
                              <span className="text-[13px] font-mono font-medium text-zinc-600 dark:text-zinc-300">{(tc.cost / 1000).toFixed(3)}s</span>
                            </div>
                          )}
                        </div>

                        {/* Params - Compact List */}
                        {paramEntries.length > 0 ? (
                          <div className="space-y-1.5">
                            {paramEntries.map(([key, value]) => (
                              <div key={key} className="flex items-start gap-2 py-1">
                                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 min-w-[60px]">{key}</span>
                                <span className="text-[11px] font-mono leading-snug wrap-break-word text-zinc-700 dark:text-zinc-300">{formatValue(value)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">No parameters</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </motion.div>
  );
});
