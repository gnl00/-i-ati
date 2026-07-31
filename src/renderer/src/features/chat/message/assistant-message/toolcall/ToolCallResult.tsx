import { SpeedCodeHighlight } from '@renderer/features/chat/common/SpeedCodeHighlight'
import { cn } from '@renderer/shared/lib/utils'
import { TOOL_CALL_REASON_PARAMETER_NAME } from '@shared/tools/definitions-utils'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Check, FileText, List, Loader2, PanelRightOpen, PencilLine, Search, Trash2, X } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { WebSearchResults, type WebSearchResult } from './WebSearchResults'
import { SubagentResults } from './SubagentResults'
import { CopyButton } from '../../message-operations'
import {
  SupportSegmentHeader,
  type SupportSegmentHeaderTone
} from '../renderers/SupportSegmentHeader'
import { getReasonFromToolCall } from '../model/toolCallReason'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import type { ToolLiveOutput } from '@renderer/features/chat/state/chatRunUiStore'
import { TOOL_CALL_RESULT_WIDTH_CLASS_NAME } from './toolCallLayout'

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
  return `${(Math.max(0, costMs) / 1000).toFixed(2)}s`
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

function getToolCallParamEntries(
  args: ToolCallResponse['args']
): Array<[string, unknown]> {
  if (!args) return []
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      return isRecord(parsed)
        ? filterDisplayParamEntries(Object.entries(parsed))
        : []
    } catch {
      return [['input', args]]
    }
  }
  return filterDisplayParamEntries(Object.entries(args))
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

export const ToolCallDuration = React.memo(({
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
  iconClassName?: string
} {
  if (args.isError) {
    return {
      Icon: X
    }
  }

  if (args.isRunning || args.isPending) {
    return {
      Icon: Loader2,
      iconClassName: args.isRunning ? 'animate-spin motion-reduce:animate-none' : undefined
    }
  }

  return {
    Icon: Check
  }
}

export function getToolCallTriggerButtonClassName({
  isError,
  isRunning,
  isPending,
  isSelected = false,
  density = 'regular',
  className
}: {
  isError: boolean
  isRunning: boolean
  isPending: boolean
  isSelected?: boolean
  density?: 'regular' | 'compact'
  className?: string
}): string {
  return cn(
    'group/toolcall inline-flex w-full cursor-pointer justify-start rounded-lg border text-left outline-hidden',
    'transition-[background-color,border-color,box-shadow] duration-150 ease-out',
    'border-slate-200/24 bg-white/34 hover:border-slate-200/36 hover:bg-slate-50/82',
    'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'dark:border-slate-800/48 dark:bg-white/3 dark:hover:border-slate-700/60 dark:hover:bg-white/5 dark:focus-visible:ring-slate-500/80',
    density === 'compact' ? 'px-1.5 py-1' : 'px-2 py-1.5',
    isError && 'border-red-200/38 hover:border-red-300/52 dark:border-red-900/28 dark:hover:border-red-800/42',
    (isRunning || isPending) && !isError
      && 'border-amber-200/34 hover:border-amber-300/48 dark:border-amber-900/24 dark:hover:border-amber-800/38',
    isSelected && 'border-slate-400/45 bg-slate-100/88 shadow-xs dark:border-slate-600/60 dark:bg-white/8',
    className
  )
}

export const ToolCallTriggerContent = React.memo(({
  toolCall,
  isError,
  isRunning,
  isPending,
  isSelected,
  density = 'regular',
  className,
  durationClassName,
  trailing
}: {
  toolCall: ToolCallSegment
  isError: boolean
  isRunning: boolean
  isPending: boolean
  isSelected: boolean
  density?: 'regular' | 'compact'
  className?: string
  durationClassName?: string
  trailing?: React.ReactNode
}) => {
  const reason = getReasonFromToolCall(toolCall)
  const {
    Icon: StatusIcon,
    iconClassName
  } = getToolCallStatusIconMeta({ isError, isRunning, isPending })
  const tone: SupportSegmentHeaderTone = isError
    ? 'danger'
    : isRunning || isPending
      ? 'warning'
      : 'success'

  return (
    <SupportSegmentHeader
      dataTestId={`tool-call-trigger-content-${toolCall.segmentId}`}
      icon={StatusIcon}
      name={toolCall.name}
      description={reason}
      duration={(
        <ToolCallDuration
          cost={toolCall.cost}
          isRunning={isRunning}
          runningStartedAt={toolCall.executionStartedAt ?? toolCall.timestamp}
          dataTestId={`tool-call-trigger-duration-${toolCall.segmentId}`}
        />
      )}
      trailing={trailing}
      tone={tone}
      density={density}
      isOpen={isSelected}
      className={className}
      durationClassName={durationClassName}
      iconClassName={iconClassName}
      testIds={{
        icon: `tool-call-trigger-status-${toolCall.segmentId}`,
        name: `tool-call-trigger-name-${toolCall.segmentId}`,
        description: `tool-call-trigger-reason-${toolCall.segmentId}`
      }}
    />
  )
})

ToolCallTriggerContent.displayName = 'ToolCallTriggerContent'

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

export type ToolCallInspectorDetailsProps = {
  toolCall: ToolCallSegment
  toolResponse: ToolCallResponse | undefined
  liveOutput?: ToolLiveOutput
}

const LiveToolOutput = React.memo(({ output }: { output: ToolLiveOutput }) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const isPinnedRef = useRef(true)

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport && isPinnedRef.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
  }, [output.sequence, output.stderr, output.stdout])

  const renderStream = (
    label: 'stdout' | 'stderr',
    content: string
  ): React.ReactNode => {
    if (!content) {
      return null
    }
    return (
      <section>
        <div className="sticky top-0 border-b border-white/8 bg-zinc-900/95 px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500 backdrop-blur-xs">
          {label}
        </div>
        <pre
          className={cn(
            'wrap-break-word whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed',
            label === 'stderr'
              ? 'text-amber-300'
              : 'text-zinc-200'
          )}
        >
          {content}
        </pre>
      </section>
    )
  }

  return (
    <div
      ref={viewportRef}
      data-testid="tool-live-output"
      className="mb-3 mr-3 h-[176px] overflow-auto overscroll-contain rounded-md border border-black/10 bg-[#09090b] custom-scrollbar dark:border-white/10"
      onScroll={(event) => {
        const viewport = event.currentTarget
        isPinnedRef.current = (
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
        ) <= 24
      }}
      onWheel={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
    >
      {renderStream('stdout', output.stdout)}
      {renderStream('stderr', output.stderr)}
    </div>
  )
})

LiveToolOutput.displayName = 'LiveToolOutput'

function getResultPayload(toolResponse: ToolCallResponse | undefined): unknown {
  return toolResponse?.result
    ?? toolResponse?.raw
    ?? (toolResponse?.error !== undefined
      ? { success: false, message: toolResponse.error }
      : undefined)
    ?? (isDirectToolResultPayload(toolResponse) ? toolResponse : undefined)
}

function serializeInspectorValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isInspectorComplexValue(value: unknown): boolean {
  if (value !== null && typeof value === 'object') return true
  const serialized = serializeInspectorValue(value)
  return serialized.includes('\n') || serialized.length > 160
}

const InspectorSection: React.FC<{
  label: string
  copyContent: unknown
  copyLabel: string
  children: React.ReactNode
  action?: React.ReactNode
  isFirst?: boolean
  isLast?: boolean
}> = ({
  label,
  copyContent,
  copyLabel,
  children,
  action,
  isFirst = false,
  isLast = false
}) => (
  <section
    className={cn(
      'relative pl-7',
      !isLast && 'border-b border-black/6 dark:border-white/[0.07]'
    )}
    data-testid={`tool-inspector-${label.toLowerCase().replace(' ', '-')}`}
  >
    <span
      className="absolute inset-y-0 left-2.25 w-1.5"
      aria-hidden="true"
    >
      <span className={cn(
        'absolute left-[2.5px] top-0 h-4 w-px',
        isFirst ? 'bg-transparent' : 'bg-slate-300 dark:bg-slate-700'
      )} />
      <span className="absolute left-0 top-3.25 h-1.5 w-1.5 border border-slate-400 bg-white dark:border-slate-500 dark:bg-zinc-950" />
      <span className={cn(
        'absolute bottom-0 left-[2.5px] top-4 w-px',
        isLast ? 'bg-transparent' : 'bg-slate-300 dark:bg-slate-700'
      )} />
    </span>
    <div className="min-w-0 overflow-hidden">
      <div className="flex h-8 items-center justify-between px-3">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <div className="flex items-center gap-1">
          {action}
          <CopyButton
            variant="compact"
            label={`Copy ${label.toLowerCase()}`}
            onClick={() => {
              void navigator.clipboard.writeText(serializeInspectorValue(copyContent))
              toast.success(`${copyLabel} copied`)
            }}
          />
        </div>
      </div>
      {children}
    </div>
  </section>
)

export const ToolCallInspectorDetails = React.memo(({
  toolCall,
  toolResponse,
  liveOutput
}: ToolCallInspectorDetailsProps) => {
  const shouldReduceMotion = Boolean(useReducedMotion())
  const [isExpanded, setIsExpanded] = useState(false)
  const resultPayload = useMemo(() => getResultPayload(toolResponse), [toolResponse])
  const detailPayload = resultPayload
  const paramEntries = useMemo(
    () => getToolCallParamEntries(toolResponse?.args),
    [toolResponse?.args]
  )
  const areArgsReady = areToolCallArgsReady(toolResponse, toolCall)
  const toolName = toolResponse?.toolName ?? toolCall.name
  const webSearchPayload = toolName === 'web_search'
    ? (toolResponse?.result ?? toolResponse?.raw ?? toolResponse)
    : undefined
  const isSubagentTool = toolName === 'subagent_spawn' || toolName === 'subagent_wait'
  const isWikiTool = isWikiToolName(toolName)
  const hasWebSearchResults = Boolean(
    webSearchPayload
    && isRecord(webSearchPayload)
    && Array.isArray(webSearchPayload.results)
  )
  const hasSpecializedResult = hasWebSearchResults
    || (isSubagentTool && resultPayload !== undefined)
    || (isWikiTool && resultPayload !== undefined)
  const resultText = useMemo(() => serializeInspectorValue(detailPayload), [detailPayload])
  const resultLines = useMemo(() => resultText.split('\n'), [resultText])
  const isResultLong = resultText.length > CONTENT_CHAR_THRESHOLD || resultLines.length > JSON_LINE_THRESHOLD
  const visibleResult = isResultLong && !isExpanded
    ? resultLines.slice(0, JSON_LINE_THRESHOLD).join('\n').slice(0, CONTENT_CHAR_THRESHOLD)
    : resultText
  const resultViewLabels = hasSpecializedResult
    ? (['Formatted', 'Raw'] as const)
    : (['Preview', 'Full'] as const)
  const liveText = liveOutput
    ? [liveOutput.stdout, liveOutput.stderr].filter(Boolean).join('\n')
    : ''

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 5 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.17, ease: [0.22, 1, 0.36, 1] }}
      className="pb-2"
      data-testid="tool-call-inspector-details"
    >
      <InspectorSection
        label="Parameters"
        copyContent={areArgsReady ? Object.fromEntries(paramEntries) : ''}
        copyLabel="Parameters"
        isFirst
      >
        <div
          data-testid="tool-inspector-parameters-content"
          className="max-h-[min(280px,35vh)] overflow-y-auto px-3 pb-3 custom-scrollbar"
        >
          {!areArgsReady ? (
            <p className="text-[11px] italic text-zinc-400 dark:text-zinc-500">Preparing parameters...</p>
          ) : paramEntries.length > 0 ? (
            <div className="space-y-2">
              {paramEntries.map(([key, value]) => {
                const isComplex = isInspectorComplexValue(value)
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-x-3 gap-y-1.5"
                  >
                    <span className="truncate pt-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {key}
                    </span>
                    <span className={cn(
                      'wrap-break-word whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300',
                      isComplex && 'rounded-md border border-gray-200/45 bg-gray-200/20 px-2 py-1.5 dark:border-white/8 dark:bg-black/20'
                    )}>
                      {serializeInspectorValue(value)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] italic text-zinc-400 dark:text-zinc-500">No parameters</p>
          )}
        </div>
      </InspectorSection>

      {liveOutput && (
        <InspectorSection
          label="Execution output"
          copyContent={liveText}
          copyLabel="Output"
        >
          <LiveToolOutput output={liveOutput} />
        </InspectorSection>
      )}

      <InspectorSection
        label="Result"
        copyContent={resultText}
        copyLabel="Result"
        isLast
        action={isResultLong || hasSpecializedResult ? (
          <div className="flex h-6 items-center rounded-md bg-zinc-100 p-0.5 dark:bg-white/[0.06]">
            {resultViewLabels.map((label, index) => {
              const active = index === 1 ? isExpanded : !isExpanded
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    'h-5 rounded-sm px-2 text-[9px] font-medium outline-hidden transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-inset dark:focus-visible:ring-zinc-500/80',
                    active
                      ? 'bg-white text-zinc-800 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  )}
                  onClick={() => setIsExpanded(index === 1)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        ) : undefined}
      >
        {hasSpecializedResult && isExpanded ? (
          <div className="relative mb-3 mr-3 max-h-[min(520px,55vh)] overflow-auto overscroll-contain rounded-md border border-black/10 bg-[#09090b] custom-scrollbar dark:border-white/10">
            <SpeedCodeHighlight
              code={resultText}
              language="json"
              className="min-h-full"
              themeOverride="github-dim"
            />
          </div>
        ) : hasWebSearchResults && webSearchPayload && isRecord(webSearchPayload) ? (
          <div className="pr-3 pb-3">
            <WebSearchResults results={webSearchPayload.results as WebSearchResult[]} />
          </div>
        ) : isSubagentTool && resultPayload ? (
          <div className="pr-3 pb-3">
            <SubagentResults toolName={toolName} payload={resultPayload} />
          </div>
        ) : isWikiTool && resultPayload !== undefined ? (
          <div className="pr-3 pb-3">
            <WikiToolSummary toolName={toolName} payload={resultPayload} />
          </div>
        ) : resultText ? (
          <div className="relative mb-3 mr-3 max-h-[min(520px,55vh)] overflow-auto overscroll-contain rounded-md border border-black/10 bg-[#09090b] custom-scrollbar dark:border-white/10">
            <SpeedCodeHighlight
              code={visibleResult}
              language="json"
              className="min-h-full"
              themeOverride="github-dim"
            />
            {isResultLong && !isExpanded && (
              <div className="sticky bottom-0 border-t border-white/10 bg-zinc-950/92 px-3 py-1.5 text-[10px] text-zinc-400 backdrop-blur-xs">
                Showing a shortened preview. Choose Full for the complete payload.
              </div>
            )}
          </div>
        ) : (
          <p className="pr-3 pb-3 text-[11px] italic text-zinc-400 dark:text-zinc-500">
            Waiting for result
          </p>
        )}
      </InspectorSection>
    </motion.div>
  )
})

ToolCallInspectorDetails.displayName = 'ToolCallInspectorDetails'

const ToolCallResultComponent: React.FC<ToolCallResultProps> = ({ toolCall: tc }) => {
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const inspectToolCall = useChatStore(state => state.inspectToolCall)
  const isSelected = useChatStore(state => (
    Boolean(currentChatUuid)
    && state.toolCallInspectorSelection?.chatUuid === currentChatUuid
    && state.toolCallInspectorSelection.segmentId === tc.segmentId
  ))
  const {
    isError,
    isPending,
    isRunning,
    statusLabel
  } = getToolCallHeaderState(tc)

  return (
    <motion.div
      data-testid="tool-call-result"
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className={cn(TOOL_CALL_RESULT_WIDTH_CLASS_NAME, 'py-1 font-sans flow-root')}
    >
      <button
        type="button"
        aria-label={getToolCallTriggerAriaLabel(tc.name, statusLabel)}
        aria-pressed={isSelected}
        onClick={() => {
          if (!currentChatUuid) return
          inspectToolCall({
            chatUuid: currentChatUuid,
            segmentId: tc.segmentId,
            toolCallId: tc.toolCallId
          })
        }}
        className={getToolCallTriggerButtonClassName({
          isError,
          isRunning,
          isPending,
          isSelected
        })}
      >
        <ToolCallTriggerContent
          toolCall={tc}
          isError={isError}
          isRunning={isRunning}
          isPending={isPending}
          isSelected={isSelected}
          className="w-full"
          trailing={(
            <PanelRightOpen
              aria-hidden="true"
              data-testid={`tool-call-inspector-icon-${tc.segmentId}`}
              className="h-3.5 w-3.5"
            />
          )}
        />
      </button>
    </motion.div>
  )
}

export const ToolCallResult = React.memo(
  ToolCallResultComponent,
  (prevProps, nextProps) => areToolCallSegmentsEqual(prevProps.toolCall, nextProps.toolCall)
)
