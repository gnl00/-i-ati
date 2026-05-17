import { SpeedCodeHighlight } from '@renderer/components/chat/common/SpeedCodeHighlight'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { motion, useReducedMotion } from 'framer-motion'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { Braces, Check, ChevronDown, Clipboard, Loader2, Wrench, X } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { WebSearchResults } from './WebSearchResults'
import { SubagentResults } from './SubagentResults'

interface ToolCallResultProps {
  toolCall: ToolCallSegment
  index: number
}

type ToolCallRenderContent = Record<string, unknown> | undefined
type ToolCallResponse = {
  toolName?: string
  args?: Record<string, unknown> | string
  result?: any
  status?: string
  error?: string
  raw?: any
  results?: any[]
}

const TOOL_COST_TICK_MS = 1000
const TOOL_COST_REDUCED_TICK_MS = 250
const TOOL_COST_SETTLE_MS = 360
const JSON_LINE_THRESHOLD = 24
const CONTENT_CHAR_THRESHOLD = 1500
const TOOL_CALL_ARGS_READY_STATUSES = new Set([
  'running',
  'success',
  'completed',
  'failed',
  'error',
  'aborted',
  'denied',
  'timeout',
  'cancelled'
])

function filterDisplayParamEntries(entries: Array<[string, unknown]>): Array<[string, unknown]> {
  return entries.filter(([key]) => key !== TOOL_CALL_REASON_PARAMETER_NAME)
}

function formatToolCost(costMs: number): string {
  return `${(Math.max(0, costMs) / 1000).toFixed(3)}s`
}

function easeOutQuart(progress: number): number {
  return 1 - Math.pow(1 - progress, 4)
}

function useAnimatedToolCost(costMs: number | undefined, isRunning: boolean): number {
  const shouldReduceMotion = useReducedMotion()
  const [displayCostMs, setDisplayCostMs] = useState(() => (typeof costMs === 'number' ? costMs : 0))
  const latestDisplayRef = useRef(displayCostMs)
  const runningStartedAtRef = useRef<number | null>(null)

  useEffect(() => {
    latestDisplayRef.current = displayCostMs
  }, [displayCostMs])

  useEffect(() => {
    if (typeof costMs === 'number') {
      runningStartedAtRef.current = null

      if (shouldReduceMotion) {
        setDisplayCostMs(costMs)
        return
      }

      const from = latestDisplayRef.current
      const to = costMs

      if (Math.abs(to - from) < 16) {
        setDisplayCostMs(to)
        return
      }

      let frameId = 0
      const startedAt = performance.now()

      const step = (now: number) => {
        const progress = Math.min((now - startedAt) / TOOL_COST_SETTLE_MS, 1)
        setDisplayCostMs(from + (to - from) * easeOutQuart(progress))

        if (progress < 1) {
          frameId = window.requestAnimationFrame(step)
          return
        }

        setDisplayCostMs(to)
      }

      frameId = window.requestAnimationFrame(step)
      return () => window.cancelAnimationFrame(frameId)
    }

    if (!isRunning) {
      runningStartedAtRef.current = null
      setDisplayCostMs(0)
      return
    }

    const now = performance.now()
    if (runningStartedAtRef.current === null) {
      runningStartedAtRef.current = now - latestDisplayRef.current
    }

    const updateCost = () => {
      const startedAt = runningStartedAtRef.current ?? performance.now()
      setDisplayCostMs(performance.now() - startedAt)
    }

    updateCost()
    const intervalId = window.setInterval(
      updateCost,
      shouldReduceMotion ? TOOL_COST_REDUCED_TICK_MS : TOOL_COST_TICK_MS
    )

    return () => window.clearInterval(intervalId)
  }, [costMs, isRunning, shouldReduceMotion])

  return displayCostMs
}

function getToolCallRenderContent(segment: ToolCallSegment): ToolCallRenderContent {
  return segment.content as ToolCallRenderContent
}

function getNormalizedStatus(status: unknown): string | undefined {
  return typeof status === 'string' ? status.toLowerCase() : undefined
}

function hasToolCallTerminalPayload(content: ToolCallRenderContent): boolean {
  return content?.result !== undefined
    || content?.raw !== undefined
    || content?.error !== undefined
}

function areToolCallArgsReady(
  content: ToolCallRenderContent,
  segment?: Pick<ToolCallSegment, 'cost' | 'isError'>
): boolean {
  const status = getNormalizedStatus(content?.status)

  if (status === 'pending') {
    return false
  }

  if (status && TOOL_CALL_ARGS_READY_STATUSES.has(status)) {
    return true
  }

  return Boolean(segment?.isError || segment?.cost !== undefined || hasToolCallTerminalPayload(content))
}

function formatValue(value: unknown): string {
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

function hasSameToolCallRenderState(
  previous: ToolCallRenderContent,
  next: ToolCallRenderContent,
  previousSegment: ToolCallSegment,
  nextSegment: ToolCallSegment
): boolean {
  if (
    previous?.status !== next?.status
    || previous?.error !== next?.error
    || previous?.result !== next?.result
    || previous?.raw !== next?.raw
  ) {
    return false
  }

  const previousArgsReady = areToolCallArgsReady(previous, previousSegment)
  const nextArgsReady = areToolCallArgsReady(next, nextSegment)

  return previousArgsReady || nextArgsReady
    ? previous?.args === next?.args
    : true
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
    getToolCallRenderContent(next),
    previous,
    next
  )
}

const ToolCallDuration = React.memo(({
  cost,
  isRunning,
  className
}: {
  cost?: number
  isRunning: boolean
  className?: string
}) => {
  const displayCostMs = useAnimatedToolCost(cost, isRunning)

  return (
    <span className={className}>
      {formatToolCost(displayCostMs)}
    </span>
  )
})

ToolCallDuration.displayName = 'ToolCallDuration'

const ToolCallHeader = React.memo(({
  name,
  isError,
  isRunning,
  isPending,
  isOpen,
  cost
}: {
  name: string
  isError: boolean
  isRunning: boolean
  isPending: boolean
  isOpen: boolean
  cost?: number
}) => {
  const statusTone = isError
    ? 'bg-red-100/85 text-red-700 dark:bg-red-900/24 dark:text-red-300'
    : isRunning || isPending
      ? 'bg-amber-100/85 text-amber-600 dark:bg-amber-900/24 dark:text-amber-200'
      : 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-900/24 dark:text-emerald-300'
  const statusIcon = isError
    ? <X className="w-2.5 h-2.5" />
    : isRunning
      ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
      : <Check className="w-2.5 h-2.5" />
  const statusLabel = isError ? 'ERR' : isRunning ? 'RUNNING' : isPending ? 'PENDING' : 'OK'

  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 w-fit')}>
      <span className="inline-flex items-center gap-2 rounded-xl px-2 py-1 transition-colors duration-200 ease-out group-hover:bg-slate-100/55 dark:group-hover:bg-white/4">
        <span className={cn(
          'inline-flex items-center gap-1.5 px-1.5 py-1 rounded-full text-[10px] font-semibold leading-none',
          statusTone
        )}>
          {statusIcon}
          {statusLabel}
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
          <span className="uppercase">
            {name}
          </span>
          <span className="text-slate-400/90 dark:text-slate-300 text-[10px]">
            {' · '}
            <ToolCallDuration cost={cost} isRunning={isRunning} />
          </span>
        </span>

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100/70 dark:bg-zinc-900/35 select-none" />

        <ChevronDown className={cn(
          'w-3 h-3 transition-transform duration-300 text-zinc-500 dark:text-zinc-400',
          isOpen && 'rotate-180 text-zinc-600 dark:text-zinc-300'
        )} />
      </span>
    </div>
  )
})

ToolCallHeader.displayName = 'ToolCallHeader'

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

const ToolCallResultComponent: React.FC<ToolCallResultProps> = ({ toolCall: tc }) => {
  const [openItem, setOpenItem] = useState<string>('')
  const [showDetails, setShowDetails] = useState(false)
  const isOpen = openItem === 'tool-result'

  const toolResponse = tc.content as ToolCallResponse | undefined

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

  const toolName = toolResponse?.toolName ?? tc.name
  const isWebSearch = toolName === 'web_search'
  const webSearchPayload = useMemo(() => {
    if (!isWebSearch) {
      return null
    }

    const payload = toolResponse?.result ?? toolResponse?.raw ?? toolResponse
    return payload?.results ? payload : null
  }, [isWebSearch, toolResponse])
  const isSubagentTool = toolName === 'subagent_spawn' || toolName === 'subagent_wait'
  const subagentData = isSubagentTool ? (resultPayload ?? toolResponse) : null
  const isError = Boolean(tc.isError)
  const status = getNormalizedStatus(toolResponse?.status)
  const isPending = !isError && status === 'pending'
  const isRunning = !isError && status === 'running'
  const areArgsReady = areToolCallArgsReady(toolResponse, tc)
  const [isJsonExpanded, setIsJsonExpanded] = useState(false)
  const shouldPrepareSummary = isOpen && !showDetails && areArgsReady
  const shouldPrepareDetails = isOpen && showDetails && areArgsReady

  const paramEntries = useMemo(() => {
    if (!shouldPrepareSummary) return []
    const args = toolResponse?.args
    if (!args) return []
    if (typeof args === 'string') {
      try {
        const parsed = JSON.parse(args)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return filterDisplayParamEntries(Object.entries(parsed) as Array<[string, unknown]>)
        }
      } catch {
        return [['input', args]] as Array<[string, unknown]>
      }
      return []
    }
    return filterDisplayParamEntries(Object.entries(args) as Array<[string, unknown]>)
  }, [shouldPrepareSummary, toolResponse?.args])

  const contentString = useMemo(() => {
    if (!shouldPrepareDetails) return ''
    return typeof resultPayload?.content === 'string' ? resultPayload.content : ''
  }, [resultPayload, shouldPrepareDetails])

  const contentLineCount = useMemo(() => {
    if (!shouldPrepareDetails) return 0
    return contentString ? contentString.split('\n').length : 0
  }, [contentString, shouldPrepareDetails])

  const isContentLong = contentLineCount > JSON_LINE_THRESHOLD || contentString.length > CONTENT_CHAR_THRESHOLD

  const jsonBaseContent = useMemo(() => {
    if (!shouldPrepareDetails) return ''
    if (!isJsonExpanded && isContentLong && resultPayload && typeof resultPayload === 'object') {
      const preview = contentString
        ? `${contentString.slice(0, CONTENT_CHAR_THRESHOLD)}${contentString.length > CONTENT_CHAR_THRESHOLD ? '...' : ''}`
        : contentString
      return JSON.stringify({ ...(resultPayload as Record<string, unknown>), content: preview }, null, 2)
    }
    return JSON.stringify(resultPayload ?? toolResponse, null, 2)
  }, [contentString, isContentLong, isJsonExpanded, resultPayload, shouldPrepareDetails, toolResponse])

  const jsonLines = useMemo(() => (
    shouldPrepareDetails ? jsonBaseContent.split('\n') : []
  ), [jsonBaseContent, shouldPrepareDetails])
  const isJsonLong = isContentLong || jsonLines.length > JSON_LINE_THRESHOLD
  const visibleJsonContent = isJsonLong && !isJsonExpanded
    ? jsonLines.slice(0, JSON_LINE_THRESHOLD).join('\n')
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
            <ToolCallHeader
              name={tc.name}
              isError={isError}
              isRunning={isRunning}
              isPending={isPending}
              isOpen={isOpen}
              cost={tc.cost}
            />
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
                {webSearchPayload ? (
                  <div className="p-3 bg-slate-100/50 dark:bg-slate-900/34">
                    <WebSearchResults results={webSearchPayload.results} />
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
                                <span className="text-[13px] font-mono font-medium text-zinc-600 dark:text-zinc-300">{formatToolCost(tc.cost)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex-1 overflow-hidden">
                            {!areArgsReady ? (
                              <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">Preparing tool call parameters...</div>
                            ) : paramEntries.length > 0 ? (
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

export const ToolCallResult = React.memo(
  ToolCallResultComponent,
  (prevProps, nextProps) => areToolCallSegmentsEqual(prevProps.toolCall, nextProps.toolCall)
)
