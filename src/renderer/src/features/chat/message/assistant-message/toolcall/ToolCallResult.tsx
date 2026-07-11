import { SpeedCodeHighlight } from '@renderer/features/chat/common/SpeedCodeHighlight'
import { Button } from '@renderer/shared/components/ui/button'
import { cn } from '@renderer/shared/lib/utils'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Braces, Check, Clipboard, FileText, List, Loader2, PencilLine, Search, Trash2, X } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { WebSearchResults } from './WebSearchResults'
import { SubagentResults } from './SubagentResults'
import { AssistantSegmentPopout } from '../renderers/AssistantSegmentPopout'
import type { SupportSegmentHeaderTone } from '../renderers/SupportSegmentHeader'
import { getReasonFromToolCall } from '../model/toolCallReason'

export interface ToolCallResultProps {
  toolCall: ToolCallSegment
  index: number
}

type ToolCallRenderContent = Record<string, unknown> | undefined
export type ToolCallResponse = {
  toolName?: string
  args?: Record<string, unknown> | string
  result?: any
  status?: string
  error?: string
  raw?: any
  results?: any[]
}
export interface ToolCallHeaderState {
  toolResponse: ToolCallResponse | undefined
  status: string | undefined
  isError: boolean
  isPending: boolean
  isRunning: boolean
  statusLabel: 'completed' | 'failed' | 'pending' | 'running'
  tone: SupportSegmentHeaderTone
}
type WikiToolName = 'wiki_list' | 'wiki_read' | 'wiki_write' | 'wiki_delete' | 'wiki_search'
type WikiResultRecord = Record<string, unknown>

const TOOL_COST_TICK_MS = 1000
const TOOL_COST_REDUCED_TICK_MS = 250
const TOOL_COST_SETTLE_MS = 360
const JSON_LINE_THRESHOLD = 24
const CONTENT_CHAR_THRESHOLD = 1500
const TOOL_CALL_ERROR_STATUSES = new Set([
  'failed',
  'error',
  'aborted',
  'denied',
  'timeout',
  'cancelled'
])
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

function getDisplayArgs(args: ToolCallResponse['args']): ToolCallResponse['args'] {
  if (!args) {
    return args
  }

  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      if (isRecord(parsed)) {
        return Object.fromEntries(filterDisplayParamEntries(Object.entries(parsed)))
      }
    } catch {
      return args
    }

    return args
  }

  return Object.fromEntries(filterDisplayParamEntries(Object.entries(args)))
}

function getDisplayToolResponsePayload(toolResponse: ToolCallResponse | undefined): ToolCallResponse | undefined {
  if (!toolResponse || toolResponse.args === undefined) {
    return toolResponse
  }

  return {
    ...toolResponse,
    args: getDisplayArgs(toolResponse.args)
  }
}

function isRecord(value: unknown): value is WikiResultRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isWikiToolName(toolName: string): toolName is WikiToolName {
  return toolName === 'wiki_list'
    || toolName === 'wiki_read'
    || toolName === 'wiki_write'
    || toolName === 'wiki_delete'
    || toolName === 'wiki_search'
}

function getStringField(record: WikiResultRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function getNumberField(record: WikiResultRecord, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getRecordArrayField(record: WikiResultRecord, key: string): WikiResultRecord[] {
  const value = record[key]
  return Array.isArray(value)
    ? value.filter(isRecord)
    : []
}

function getFirstStringField(record: WikiResultRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = getStringField(record, key)
    if (value) {
      return value
    }
  }
  return undefined
}

function formatPreviewText(value: unknown, maxLength = 180): string {
  if (typeof value !== 'string') {
    return ''
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}…` : compact
}

function formatWikiCount(count: number | undefined, singular: string, plural: string): string {
  const safeCount = typeof count === 'number' ? count : 0
  return `${safeCount} ${safeCount === 1 ? singular : plural}`
}

function formatToolCost(costMs: number): string {
  return `${(Math.max(0, costMs) / 1000).toFixed(3)}s`
}

function easeOutQuart(progress: number): number {
  return 1 - Math.pow(1 - progress, 4)
}

function useAnimatedToolCost(
  costMs: number | undefined,
  isRunning: boolean,
  runningStartedAt?: number
): number {
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

    if (typeof runningStartedAt === 'number') {
      runningStartedAtRef.current = runningStartedAt
    } else if (runningStartedAtRef.current === null) {
      runningStartedAtRef.current = Date.now() - latestDisplayRef.current
    }

    const updateCost = () => {
      const startedAt = runningStartedAtRef.current ?? Date.now()
      setDisplayCostMs(Date.now() - startedAt)
    }

    updateCost()
    const intervalId = window.setInterval(
      updateCost,
      shouldReduceMotion ? TOOL_COST_REDUCED_TICK_MS : TOOL_COST_TICK_MS
    )

    return () => window.clearInterval(intervalId)
  }, [costMs, isRunning, runningStartedAt, shouldReduceMotion])

  return displayCostMs
}

function getToolCallRenderContent(segment: ToolCallSegment): ToolCallRenderContent {
  return segment.content as ToolCallRenderContent
}

export function getNormalizedStatus(status: unknown): string | undefined {
  return typeof status === 'string' ? status.toLowerCase() : undefined
}

export function getToolCallHeaderState(segment: ToolCallSegment): ToolCallHeaderState {
  const toolResponse = segment.content as ToolCallResponse | undefined
  const status = getNormalizedStatus(toolResponse?.status)
  const isError = Boolean(segment.isError) || Boolean(status && TOOL_CALL_ERROR_STATUSES.has(status))
  const isPending = !isError && status === 'pending'
  const isRunning = !isError && status === 'running'
  const statusLabel = isError
    ? 'failed'
    : isRunning
      ? 'running'
      : isPending
        ? 'pending'
        : 'completed'
  const tone: SupportSegmentHeaderTone = isError
    ? 'danger'
    : isRunning || isPending
      ? 'warning'
      : 'success'

  return {
    toolResponse,
    status,
    isError,
    isPending,
    isRunning,
    statusLabel,
    tone
  }
}

export function getToolCallTriggerAriaLabel(
  toolName: string,
  statusLabel: ToolCallHeaderState['statusLabel']
): string {
  return `Inspect ${toolName} tool call, status ${statusLabel}`
}

function hasToolCallTerminalPayload(content: ToolCallRenderContent): boolean {
  return content?.result !== undefined
    || content?.raw !== undefined
    || content?.error !== undefined
}

function isDirectToolResultPayload(content: ToolCallRenderContent): boolean {
  return Boolean(
    content
    && !('toolName' in content)
    && !('args' in content)
    && !('status' in content)
  )
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
    && previous.executionStartedAt === next.executionStartedAt
    && previous.cost === next.cost
    && previous.latencyCost === next.latencyCost
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

  if (getReasonFromToolCall(previousSegment) !== getReasonFromToolCall(nextSegment)) {
    return false
  }

  const previousArgsReady = areToolCallArgsReady(previous, previousSegment)
  const nextArgsReady = areToolCallArgsReady(next, nextSegment)

  return previousArgsReady || nextArgsReady
    ? previous?.args === next?.args
    : true
}

export const areToolCallSegmentsEqual = (
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
  runningStartedAt,
  className,
  dataTestId
}: {
  cost?: number
  isRunning: boolean
  runningStartedAt?: number
  className?: string
  dataTestId?: string
}) => {
  const displayCostMs = useAnimatedToolCost(cost, isRunning, runningStartedAt)

  return (
    <span data-testid={dataTestId} className={className}>
      {formatToolCost(displayCostMs)}
    </span>
  )
})

ToolCallDuration.displayName = 'ToolCallDuration'

function getToolCallStatusIconMeta(args: {
  isError: boolean
  isRunning: boolean
  isPending: boolean
}): {
  Icon: LucideIcon
  className: string
  iconClassName?: string
} {
  if (args.isError) {
    return {
      Icon: X,
      className: 'border-red-200/70 bg-red-50/85 text-red-600 dark:border-red-900/45 dark:bg-red-950/28 dark:text-red-300'
    }
  }

  if (args.isRunning || args.isPending) {
    return {
      Icon: Loader2,
      className: 'border-amber-200/70 bg-amber-50/85 text-amber-700 dark:border-amber-900/45 dark:bg-amber-950/26 dark:text-amber-200',
      iconClassName: args.isRunning ? 'animate-spin' : undefined
    }
  }

  return {
    Icon: Check,
    className: 'border-emerald-200/70 bg-emerald-50/85 text-emerald-700 dark:border-emerald-900/42 dark:bg-emerald-950/24 dark:text-emerald-300'
  }
}

export function getToolCallTriggerButtonClassName({
  isError,
  isRunning,
  isPending,
  density = 'regular',
  className
}: {
  isError: boolean
  isRunning: boolean
  isPending: boolean
  density?: 'regular' | 'compact'
  className?: string
}): string {
  return cn(
    'group/toolcall inline-flex w-full max-w-[680px] cursor-pointer justify-start rounded-lg border text-left outline-hidden',
    'transition-[background-color,border-color,box-shadow] duration-150 ease-out',
    'border-slate-200/36 bg-white/34 hover:border-slate-200/54 hover:bg-slate-50/82',
    'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'dark:border-slate-800/70 dark:bg-white/3 dark:hover:border-slate-700/78 dark:hover:bg-white/5 dark:focus-visible:ring-slate-500/80',
    density === 'compact' ? 'px-1.5 py-1' : 'px-2 py-1.5',
    isError && 'border-red-200/68 hover:border-red-300/74 dark:border-red-900/38 dark:hover:border-red-800/58',
    (isRunning || isPending) && !isError
      && 'border-amber-200/56 hover:border-amber-300/68 dark:border-amber-900/32 dark:hover:border-amber-800/52',
    className
  )
}

export const ToolCallTriggerContent = React.memo(({
  toolCall,
  isError,
  isRunning,
  isPending,
  isOpen,
  density = 'regular',
  className
}: {
  toolCall: ToolCallSegment
  isError: boolean
  isRunning: boolean
  isPending: boolean
  isOpen: boolean
  density?: 'regular' | 'compact'
  className?: string
}) => {
  const reason = getReasonFromToolCall(toolCall)
  const isCompact = density === 'compact'
  const {
    Icon: StatusIcon,
    className: statusIconClassName,
    iconClassName
  } = getToolCallStatusIconMeta({ isError, isRunning, isPending })

  return (
    <span
      data-testid={`tool-call-trigger-content-${toolCall.segmentId}`}
      className={cn(
        'grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center overflow-hidden',
        isCompact ? 'gap-x-2' : 'gap-x-2.5',
        className
      )}
    >
      <span
        data-testid={`tool-call-trigger-status-${toolCall.segmentId}`}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md border transition-transform duration-150 ease-out',
          isCompact ? 'h-5 w-5' : 'h-6 w-6',
          isOpen && 'scale-105',
          statusIconClassName
        )}
        aria-hidden="true"
      >
        <StatusIcon
          className={cn(
            isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5',
            iconClassName
          )}
        />
      </span>
      <span className="flex min-w-0 flex-col justify-center">
        <span
          data-testid={`tool-call-trigger-name-${toolCall.segmentId}`}
          className={cn(
            'block min-w-0 truncate font-semibold leading-none text-slate-500 dark:text-slate-200',
            isCompact ? 'text-[10.5px]' : 'text-[11px]'
          )}
        >
          {toolCall.name.toUpperCase()}
        </span>
        {reason ? (
          <span
            data-testid={`tool-call-trigger-reason-${toolCall.segmentId}`}
            title={reason}
            className={cn(
              'mt-0.5 block w-full max-w-full truncate whitespace-nowrap font-medium leading-snug text-slate-500 dark:text-slate-400',
              isCompact ? 'text-[10px]' : 'text-[10.5px]'
            )}
          >
            {reason}
          </span>
        ) : null}
      </span>
      <ToolCallDuration
        cost={toolCall.cost}
        isRunning={isRunning}
        runningStartedAt={toolCall.executionStartedAt ?? toolCall.timestamp}
        dataTestId={`tool-call-trigger-duration-${toolCall.segmentId}`}
        className={cn(
          'shrink-0 justify-self-end self-center text-right font-medium tabular-nums leading-none text-slate-400 dark:text-slate-500',
          isCompact ? 'text-[10px]' : 'text-[10.5px]'
        )}
      />
    </span>
  )
})

ToolCallTriggerContent.displayName = 'ToolCallTriggerContent'

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

function WikiStatusLine({ payload }: { payload: WikiResultRecord }) {
  const status = getStringField(payload, 'index_status')
  const message = getStringField(payload, 'index_message')

  if (!status && !message) {
    return null
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
      {status && (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold uppercase text-slate-600 dark:bg-white/6 dark:text-slate-300">
          {status}
        </span>
      )}
      {message && <span>{message}</span>}
    </div>
  )
}

function WikiEntryLine({ item }: { item: WikiResultRecord }) {
  const name = getFirstStringField(item, ['entry_name', 'name'])
  const title = getStringField(item, 'title') ?? name ?? 'Untitled'
  const summary = formatPreviewText(getStringField(item, 'summary') ?? getStringField(item, 'text'), 140)
  const matchSource = getStringField(item, 'match_source')
  const matchReason = getStringField(item, 'match_reason')

  return (
    <div className="rounded-lg border border-slate-200/65 bg-white/58 px-2.5 py-2 dark:border-slate-800/70 dark:bg-white/4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold leading-snug text-slate-700 dark:text-slate-200">
          {title}
        </span>
        {name && title !== name && (
          <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">
            {name}
          </span>
        )}
        {matchSource && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-500 dark:bg-white/6 dark:text-slate-400">
            {matchSource}
          </span>
        )}
      </div>
      {summary && (
        <p className="mt-1 wrap-break-word text-[11px] leading-snug text-slate-600 dark:text-slate-300">
          {summary}
        </p>
      )}
      {matchReason && (
        <p className="mt-1 text-[10px] leading-snug text-slate-400 dark:text-slate-500">
          {matchReason}
        </p>
      )}
    </div>
  )
}

function WikiListSummary({ payload }: { payload: WikiResultRecord }) {
  const entries = getRecordArrayField(payload, 'entries')
  const count = entries.length

  return (
    <div className="space-y-2" data-testid="wiki-tool-summary">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        <List className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span>{formatWikiCount(count, 'entry', 'entries')}</span>
      </div>
      {entries.length > 0 ? (
        <div className="space-y-1.5">
          {entries.slice(0, 3).map((entry, index) => (
            <WikiEntryLine key={getFirstStringField(entry, ['name', 'entry_name']) ?? index} item={entry} />
          ))}
        </div>
      ) : (
        <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">No wiki entries</div>
      )}
    </div>
  )
}

function WikiReadSummary({ payload }: { payload: WikiResultRecord }) {
  const name = getStringField(payload, 'name')
  const title = getStringField(payload, 'title') ?? name ?? 'Untitled'
  const contentPreview = formatPreviewText(getStringField(payload, 'content'), 240)
  const message = getStringField(payload, 'message')

  return (
    <div className="space-y-2" data-testid="wiki-tool-summary">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span>{title}</span>
        {name && title !== name && <span className="font-mono text-[10px] text-slate-400">{name}</span>}
      </div>
      {contentPreview ? (
        <p className="wrap-break-word text-[11px] leading-snug text-slate-600 dark:text-slate-300">
          {contentPreview}
        </p>
      ) : (
        <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">{message ?? 'No content returned'}</div>
      )}
    </div>
  )
}

function WikiMutationSummary({
  payload,
  toolName
}: {
  payload: WikiResultRecord
  toolName: 'wiki_write' | 'wiki_delete'
}) {
  const success = payload.success === true
  const name = getStringField(payload, 'name') ?? 'unknown'
  const title = getStringField(payload, 'title')
  const message = getStringField(payload, 'message')
  const Icon = toolName === 'wiki_delete' ? Trash2 : PencilLine

  return (
    <div className="space-y-2" data-testid="wiki-tool-summary">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        <Icon className={cn(
          'h-3.5 w-3.5',
          success ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'
        )} />
        <span>{success ? 'Succeeded' : 'Failed'}</span>
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{title ?? name}</span>
      </div>
      {message && (
        <p className="wrap-break-word text-[11px] leading-snug text-slate-600 dark:text-slate-300">
          {message}
        </p>
      )}
      <WikiStatusLine payload={payload} />
    </div>
  )
}

function WikiSearchSummary({ payload }: { payload: WikiResultRecord }) {
  const results = getRecordArrayField(payload, 'results')
  const totalHits = getNumberField(payload, 'total_hits') ?? results.length
  const query = getStringField(payload, 'query')

  return (
    <div className="space-y-2" data-testid="wiki-tool-summary">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
        <Search className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        <span>{formatWikiCount(totalHits, 'hit', 'hits')}</span>
        {query && <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">{query}</span>}
      </div>
      {results.length > 0 ? (
        <div className="space-y-1.5">
          {results.slice(0, 3).map((result, index) => (
            <WikiEntryLine key={getFirstStringField(result, ['entry_name', 'name']) ?? index} item={result} />
          ))}
        </div>
      ) : (
        <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">No wiki results</div>
      )}
      <WikiStatusLine payload={payload} />
    </div>
  )
}

function WikiToolSummary({
  toolName,
  payload
}: {
  toolName: WikiToolName
  payload: unknown
}) {
  if (!isRecord(payload)) {
    return (
      <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500" data-testid="wiki-tool-summary">
        Waiting for wiki result
      </div>
    )
  }

  if (toolName === 'wiki_list') {
    return <WikiListSummary payload={payload} />
  }
  if (toolName === 'wiki_read') {
    return <WikiReadSummary payload={payload} />
  }
  if (toolName === 'wiki_write' || toolName === 'wiki_delete') {
    return <WikiMutationSummary payload={payload} toolName={toolName} />
  }

  return <WikiSearchSummary payload={payload} />
}

export type ToolCallResultPanelProps = {
  toolCall: ToolCallSegment
  toolResponse: ToolCallResponse | undefined
}

export const ToolCallResultPanel = React.memo(({
  toolCall: tc,
  toolResponse
}: ToolCallResultPanelProps) => {
  const [showDetails, setShowDetails] = useState(false)
  const shouldReduceMotion = Boolean(useReducedMotion())

  const resultPayload = useMemo(() => {
    return toolResponse?.result
      ?? toolResponse?.raw
      ?? (toolResponse?.error !== undefined
        ? { success: false, message: toolResponse.error }
        : undefined)
      ?? (
        isDirectToolResultPayload(toolResponse)
          ? toolResponse
          : undefined
      )
  }, [toolResponse])

  const toolName = toolResponse?.toolName ?? tc.name
  const isWebSearch = toolName === 'web_search'
  const isWikiTool = isWikiToolName(toolName)
  const hasWikiSummaryPayload = isWikiTool
    && (hasToolCallTerminalPayload(toolResponse) || isDirectToolResultPayload(toolResponse))
  const webSearchPayload = useMemo(() => {
    if (!isWebSearch) {
      return null
    }

    const payload = toolResponse?.result ?? toolResponse?.raw ?? toolResponse
    return payload?.results ? payload : null
  }, [isWebSearch, toolResponse])
  const isSubagentTool = toolName === 'subagent_spawn' || toolName === 'subagent_wait'
  const subagentData = isSubagentTool ? (resultPayload ?? toolResponse) : null
  const wikiSummaryPayload = hasWikiSummaryPayload ? resultPayload : null
  const detailPayload = useMemo(() => (
    resultPayload ?? getDisplayToolResponsePayload(toolResponse)
  ), [resultPayload, toolResponse])
  const areArgsReady = areToolCallArgsReady(toolResponse, tc)
  const [isJsonExpanded, setIsJsonExpanded] = useState(false)
  const shouldPrepareSummary = !showDetails && areArgsReady
  const shouldPrepareDetails = showDetails && areArgsReady

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
    if (!isJsonExpanded && isContentLong && detailPayload && typeof detailPayload === 'object') {
      const preview = contentString
        ? `${contentString.slice(0, CONTENT_CHAR_THRESHOLD)}${contentString.length > CONTENT_CHAR_THRESHOLD ? '...' : ''}`
        : contentString
      return JSON.stringify({ ...(detailPayload as Record<string, unknown>), content: preview }, null, 2)
    }
    return JSON.stringify(detailPayload, null, 2)
  }, [contentString, detailPayload, isContentLong, isJsonExpanded, shouldPrepareDetails])

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
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.985 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: shouldReduceMotion ? 0.12 : 0.21, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl"
    >
      {webSearchPayload ? (
        <div
          className="max-h-[min(456px,calc(100vh-160px))] overflow-y-auto bg-slate-100/50 p-3 overscroll-contain custom-scrollbar dark:bg-slate-900/34"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <WebSearchResults results={webSearchPayload.results} />
        </div>
      ) : isSubagentTool && subagentData ? (
        <div
          className="max-h-[min(456px,calc(100vh-160px))] overflow-y-auto overscroll-contain custom-scrollbar"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <SubagentResults
            toolName={(toolResponse?.toolName ?? tc.name)}
            payload={subagentData}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/55 bg-slate-50/56 px-3 py-1 dark:border-slate-800/55 dark:bg-slate-900/36">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-slate-200/55 text-slate-600 dark:bg-white/6 dark:text-slate-300">
                  <Braces className="h-3 w-3" />
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Output
                </p>
              </div>

              <SegmentedToggle
                leftLabel="Request"
                rightLabel="Response"
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
              aria-label="Copy tool result"
              className="h-7 w-7 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
              onClick={(e) => onCopyClick(e, tc.content)}
            >
              <Clipboard className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
            </Button>
          </div>

          {showDetails ? (
            <div className="relative">
              <div
                className={cn(
                  detailViewportHeightClass,
                  'w-full overflow-hidden overscroll-contain bg-white/70 dark:bg-[#09090b]'
                )}
                onWheel={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <SpeedCodeHighlight
                  code={visibleJsonContent}
                  language="json"
                  className="h-full min-h-full overflow-auto custom-scrollbar"
                  themeOverride="github-dim"
                />
              </div>
              <div
                className={cn(
                  'absolute bottom-0 left-0 right-0 border-t border-slate-200/70 bg-slate-100/90 px-3 py-1.5 text-[10px] text-zinc-500 backdrop-blur-xs transition-opacity duration-150 dark:border-slate-800 dark:bg-slate-900/90 dark:text-zinc-400',
                  isJsonLong && !isJsonExpanded ? 'opacity-100' : 'pointer-events-none opacity-0'
                )}
              >
                Showing a preview. Switch to "Full" to inspect the complete payload.
              </div>
            </div>
          ) : (
            <div
              className="max-h-[240px] overflow-y-auto overscroll-contain px-3 py-2.5 custom-scrollbar"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {!areArgsReady ? (
                <div className="text-[11px] italic text-zinc-400 dark:text-zinc-500">Preparing tool call parameters...</div>
              ) : isWikiTool && wikiSummaryPayload ? (
                <WikiToolSummary toolName={toolName} payload={wikiSummaryPayload} />
              ) : paramEntries.length > 0 ? (
                <div className="space-y-1.5 pr-1">
                  {paramEntries.map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 py-1">
                      <span className="min-w-[60px] shrink-0 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{key}</span>
                      <span className="wrap-break-word font-mono text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">{formatValue(value)}</span>
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
    </motion.div>
  )
})

ToolCallResultPanel.displayName = 'ToolCallResultPanel'

const ToolCallResultComponent: React.FC<ToolCallResultProps> = ({ toolCall: tc }) => {
  const [isOpen, setIsOpen] = useState(false)
  const {
    toolResponse,
    isError,
    isPending,
    isRunning,
    statusLabel
  } = getToolCallHeaderState(tc)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="w-full max-w-full py-1 font-sans flow-root"
    >
      <AssistantSegmentPopout
        open={isOpen}
        onOpenChange={setIsOpen}
        contentClassName={cn(
          isError
            ? 'border-red-200/65 dark:border-red-900/35'
            : 'border-slate-200/70 dark:border-slate-800/70'
        )}
        renderTrigger={({ isOpen }) => (
          <button
            type="button"
            aria-label={getToolCallTriggerAriaLabel(tc.name, statusLabel)}
            className={getToolCallTriggerButtonClassName({
              isError,
              isRunning,
              isPending
            })}
          >
            <ToolCallTriggerContent
              toolCall={tc}
              isError={isError}
              isRunning={isRunning}
              isPending={isPending}
              isOpen={isOpen}
              className="w-full"
            />
          </button>
        )}
      >
        <ToolCallResultPanel
          toolCall={tc}
          toolResponse={toolResponse}
        />
      </AssistantSegmentPopout>
    </motion.div>
  )
}

export const ToolCallResult = React.memo(
  ToolCallResultComponent,
  (prevProps, nextProps) => areToolCallSegmentsEqual(prevProps.toolCall, nextProps.toolCall)
)
