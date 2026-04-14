import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { motion } from 'framer-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { Braces, Check, ChevronDown, Clipboard, Loader2, Wrench, X } from 'lucide-react'
import React, { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { WebSearchResults } from './WebSearchResults'
import { SubagentResults } from './SubagentResults'

interface ToolCallResultNextOutputProps {
  toolCall: ToolCallSegment
  index: number
}

type ToolCallRenderContent = Record<string, unknown> | undefined

function getToolCallRenderContent(segment: ToolCallSegment): ToolCallRenderContent {
  return segment.content as ToolCallRenderContent
}

function hasSameToolCallIdentity(previous: ToolCallSegment, next: ToolCallSegment): boolean {
  return previous.segmentId === next.segmentId
    && previous.name === next.name
    && previous.toolCallId === next.toolCallId
    && previous.toolCallIndex === next.toolCallIndex
}

function hasSameToolCallTiming(previous: ToolCallSegment, next: ToolCallSegment): boolean {
  return previous.timestamp === next.timestamp
    && previous.cost === next.cost
}

function hasSameToolCallRenderState(previous: ToolCallRenderContent, next: ToolCallRenderContent): boolean {
  return previous?.status === next?.status
    && previous?.args === next?.args
    && previous?.error === next?.error
    && previous?.result === next?.result
    && previous?.raw === next?.raw
}

const areToolCallSegmentsEqual = (
  previous: ToolCallSegment,
  next: ToolCallSegment
): boolean => {
  if (!hasSameToolCallIdentity(previous, next)) {
    return false
  }

  if (!hasSameToolCallTiming(previous, next)) {
    return false
  }

  if (previous.isError !== next.isError) {
    return false
  }

  return hasSameToolCallRenderState(
    getToolCallRenderContent(previous),
    getToolCallRenderContent(next)
  )
}

function SegmentedToggle({
  leftLabel,
  rightLabel,
  rightActive,
  onLeftClick,
  onRightClick
}: {
  leftLabel: string
  rightLabel: string
  rightActive: boolean
  onLeftClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  onRightClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <div className="relative inline-grid grid-cols-2 items-center rounded-xl bg-white/52 p-1 ring-1 ring-slate-200/38 dark:bg-white/4 dark:ring-white/5">
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 520, damping: 38 }}
        className={cn(
          'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-slate-800/92 dark:bg-slate-100',
          rightActive ? 'left-[calc(50%+2px)]' : 'left-1'
        )}
      />
      <button
        type="button"
        onClick={onLeftClick}
        className={cn(
          'relative z-10 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors',
          !rightActive
            ? 'text-white dark:text-slate-900'
            : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
        )}
      >
        {leftLabel}
      </button>
      <button
        type="button"
        onClick={onRightClick}
        className={cn(
          'relative z-10 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-colors',
          rightActive
            ? 'text-white dark:text-slate-900'
            : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
        )}
      >
        {rightLabel}
      </button>
    </div>
  )
}

const ToolCallResultNextOutputComponent: React.FC<ToolCallResultNextOutputProps> = ({ toolCall: tc }) => {
  const [openItem, setOpenItem] = useState<string>('')
  const [showDetails, setShowDetails] = useState(false)
  const isOpen = openItem === 'tool-result'
  const shouldPrepareSummary = isOpen && !showDetails
  const shouldPrepareDetails = isOpen && showDetails

  const toolResponse = tc.content as {
    toolName?: string
    args?: Record<string, unknown> | string
    result?: any
    status?: string
    error?: string
    raw?: any
    results?: any[]
  } | undefined

  const resultPayload = useMemo(() => {
    if (!isOpen) {
      return undefined
    }

    return toolResponse?.result
      ?? toolResponse?.raw
      ?? (
        toolResponse
        && !('toolName' in toolResponse)
        && !('args' in toolResponse)
        && !('status' in toolResponse)
          ? toolResponse
          : undefined
      )
  }, [isOpen, toolResponse])

  const isWebSearch = isOpen && (toolResponse?.toolName ?? tc.name) === 'web_search'
  const webSearchData = isWebSearch && resultPayload?.results ? resultPayload : null
  const isSubagentTool = isOpen && ((toolResponse?.toolName ?? tc.name) === 'subagent_spawn'
    || (toolResponse?.toolName ?? tc.name) === 'subagent_wait'
  )
  const subagentData = isSubagentTool ? (resultPayload ?? toolResponse) : null
  const isError = tc.isError
  const status = typeof toolResponse?.status === 'string' ? toolResponse.status : undefined
  const isRunning = !isError && status === 'running'
  const [isJsonExpanded, setIsJsonExpanded] = useState(false)
  const jsonLineThreshold = 24
  const contentCharThreshold = 1500

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
    if (!shouldPrepareSummary) return []
    const args = toolResponse?.args
    if (!args) return []
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return Object.entries(parsed) as Array<[string, unknown]>
        }
      } catch {
        return [['input', args]] as Array<[string, unknown]>
      }
      return []
    }
    return Object.entries(args) as Array<[string, unknown]>
  }, [shouldPrepareSummary, toolResponse?.args])

  const contentString = useMemo(() => {
    if (!shouldPrepareDetails) return ''
    return typeof resultPayload?.content === 'string' ? resultPayload.content : ''
  }, [resultPayload, shouldPrepareDetails])

  const contentLineCount = useMemo(() => {
    if (!shouldPrepareDetails) return 0
    return contentString ? contentString.split('\n').length : 0
  }, [contentString, shouldPrepareDetails])

  const isContentLong = contentLineCount > jsonLineThreshold || contentString.length > contentCharThreshold

  const jsonBaseContent = useMemo(() => {
    if (!shouldPrepareDetails) return ''
    if (!isJsonExpanded && isContentLong && resultPayload && typeof resultPayload === 'object') {
      const preview = contentString
        ? `${contentString.slice(0, contentCharThreshold)}${contentString.length > contentCharThreshold ? '...' : ''}`
        : contentString
      return JSON.stringify({ ...(resultPayload as Record<string, unknown>), content: preview }, null, 2)
    }
    return JSON.stringify(resultPayload ?? toolResponse, null, 2)
  }, [contentString, isContentLong, isJsonExpanded, resultPayload, shouldPrepareDetails, toolResponse])

  const jsonLines = useMemo(() => (
    shouldPrepareDetails ? jsonBaseContent.split('\n') : []
  ), [jsonBaseContent, shouldPrepareDetails])
  const isJsonLong = isContentLong || jsonLines.length > jsonLineThreshold
  const visibleJsonContent = isJsonLong && !isJsonExpanded
    ? jsonLines.slice(0, jsonLineThreshold).join('\n')
    : jsonBaseContent

  const onCopyClick = (e: React.MouseEvent, content: any) => {
    e.stopPropagation()
    const text = typeof content === 'string' ? content : visibleJsonContent
    navigator.clipboard.writeText(text)
    toast.success('Result Copied')
  }

  const detailViewportHeightClass = 'h-[176px]'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="w-full max-w-full py-1 font-sans flow-root"
    >
      <Accordion
        type="single"
        collapsible
        value={openItem}
        onValueChange={setOpenItem}
        className="group relative flex flex-col transition-all"
      >
        <AccordionItem value="tool-result" className="border-0">
          <AccordionTrigger className="group inline-flex w-auto flex-none justify-start gap-2 py-0 hover:no-underline">
            <div className={cn('flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 w-fit')}>
              <span className="inline-flex items-center gap-2 rounded-xl px-2 py-1 transition-colors duration-200 ease-out group-hover:bg-slate-100/55 dark:group-hover:bg-white/4">
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-1.5 py-1 rounded-full text-[10px] font-semibold leading-none',
                  isError
                    ? 'bg-red-100/85 text-red-700 dark:bg-red-900/24 dark:text-red-300'
                    : isRunning
                      ? 'bg-amber-100/85 text-amber-600 dark:bg-amber-900/24 dark:text-amber-200'
                      : 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-900/24 dark:text-emerald-300'
                )}>
                  {isError
                    ? <X className="w-2.5 h-2.5" />
                    : isRunning
                      ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      : <Check className="w-2.5 h-2.5" />
                  }
                  {isError ? 'ERR' : isRunning ? 'RUNNING' : 'OK'}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100/60 px-2 py-1 dark:bg-white/4">
                  <Wrench className={cn(
                    'w-3 h-3 dark:text-zinc-500/70 transition-all duration-300',
                    isOpen && 'scale-110 rotate-6'
                  )} />
                </span>

                <span className={cn(
                    'text-[11px] font-semibold tracking-tight leading-none',
                    isError ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'
                  )}>
                    <span className='uppercase'>
                      {tc.name}
                    </span>
                    <span className='text-slate-400/90 dark:text-slate-300 text-[10px]'>
                    {typeof tc.cost === 'number' ? ` · ${(tc.cost / 1000).toFixed(3)}s` : ' · 0.000s'}
                    </span>
                </span>

                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-900/35 select-none">
                  
                </span>

                <ChevronDown className={cn(
                  'w-3 h-3 transition-transform duration-300 text-zinc-500 dark:text-zinc-400',
                  isOpen && 'rotate-180 text-zinc-600 dark:text-zinc-300'
                )} />
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-0 pb-0">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden pt-2"
            >
              <div className={cn(
                'relative max-w-[760px] rounded-2xl overflow-hidden border',
                isError
                  ? 'border-red-200/65 dark:border-red-900/35'
                  : 'border-slate-200/55 dark:border-slate-800/55'
              )}>
                {isWebSearch && webSearchData ? (
                  <div className="p-3 bg-slate-100/50 dark:bg-slate-900/34">
                    <WebSearchResults results={webSearchData.results} />
                  </div>
                ) : isSubagentTool && subagentData ? (
                  <SubagentResults
                    toolName={(toolResponse?.toolName ?? tc.name)}
                    payload={subagentData}
                  />
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-0.5 border-b border-slate-200/55 dark:border-slate-800/55 bg-slate-50/56 dark:bg-slate-900/36">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-slate-200/55 text-slate-600 dark:bg-white/6 dark:text-slate-300">
                            <Braces className="h-3 w-3" />
                          </span>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                            Output
                          </p>
                        </div>

                        <SegmentedToggle
                          leftLabel="Summary"
                          rightLabel="Detail"
                          rightActive={showDetails}
                          onLeftClick={(e) => {
                            e.stopPropagation()
                            setShowDetails(false)
                          }}
                          onRightClick={(e) => {
                            e.stopPropagation()
                            setShowDetails(true)
                          }}
                        />

                        {isJsonLong && showDetails && (
                          <SegmentedToggle
                            leftLabel="Preview"
                            rightLabel="Full"
                            rightActive={isJsonExpanded}
                            onLeftClick={(e) => {
                              e.stopPropagation()
                              setIsJsonExpanded(false)
                            }}
                            onRightClick={(e) => {
                              e.stopPropagation()
                              setIsJsonExpanded(true)
                            }}
                          />
                        )}
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
                        onClick={(e) => onCopyClick(e, tc.content)}
                      >
                        <Clipboard className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                      </Button>
                    </div>

                    {showDetails ? (
                      <div className={cn('relative')}>
                        <div
                          className={cn(
                            detailViewportHeightClass,
                            'overflow-y-auto custom-scrollbar w-full bg-white/70 dark:bg-[#09090b] overscroll-contain'
                          )}
                          onWheel={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                        >
                          <SpeedCodeHighlight
                            code={visibleJsonContent}
                            language="json"
                            themeOverride="github-dim"
                          />
                        </div>
                        <div
                          className={cn(
                            'absolute bottom-0 left-0 right-0 px-3 py-1.5 text-[10px] text-zinc-500 dark:text-zinc-400 border-t border-slate-200/70 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-xs transition-opacity duration-150',
                            isJsonLong && !isJsonExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          )}
                        >
                          Showing a preview. Switch to “Full” to inspect the complete payload.
                        </div>
                      </div>
                    ) : (
                      <div className={cn('px-3 py-2.5')}>
                        <div className="flex h-full flex-col">
                          <div className="flex items-center gap-4 mb-2.5 pb-2 border-b border-zinc-200/45 dark:border-zinc-700/35">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Tool</span>
                              <span className="text-[13px] font-mono font-semibold text-zinc-600 dark:text-zinc-100">{toolResponse?.toolName ?? tc.name}</span>
                            </div>
                            {typeof tc.cost === 'number' && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-[9px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Duration</span>
                                <span className="text-[13px] font-mono font-medium text-zinc-600 dark:text-zinc-300">{(tc.cost / 1000).toFixed(3)}s</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 overflow-hidden">
                            {paramEntries.length > 0 ? (
                              <div className="h-full overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
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
                        </div>
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
  )
}

export const ToolCallResultNextOutput = React.memo(
  ToolCallResultNextOutputComponent,
  (prevProps, nextProps) => areToolCallSegmentsEqual(prevProps.toolCall, nextProps.toolCall)
)
