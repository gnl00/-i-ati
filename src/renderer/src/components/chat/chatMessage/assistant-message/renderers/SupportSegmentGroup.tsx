import { cn } from '@renderer/lib/utils'
import { SizeAnimatedPanel } from '@renderer/components/ui/size-animated-panel'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Check, ChevronDown, ChevronUp, Lightbulb, Loader2, Wrench, X } from 'lucide-react'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { ErrorMessage } from '../../error-message'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import {
  formatReasoningDurationText,
  getReasoningDurationMs,
  ReasoningSegmentPanel,
  useReasoningDurationText
} from '../segments/ReasoningSegmentNext'
import {
  areToolCallSegmentsEqual,
  getToolCallHeaderState,
  getToolCallTriggerButtonClassName,
  getToolCallTriggerAriaLabel,
  ToolCallTriggerContent,
  ToolCallResultPanel
} from '../toolcall/ToolCallResult'
import { AssistantSegmentPopout } from './AssistantSegmentPopout'
import { SupportSegmentHeader } from './SupportSegmentHeader'

type ToolCallRenderItem = SupportSegmentRenderItem & {
  segment: ToolCallSegment
}

type ReasoningRenderItem = SupportSegmentRenderItem & {
  segment: ReasoningSegment
}

export interface SupportSegmentGroupProps {
  items: SupportSegmentRenderItem[]
  forceReducedMotion?: boolean
}

interface SupportSegmentGroupExpansionPolicy {
  defaultExpanded: boolean
  hasForceExpandedItem: boolean
}

interface SupportSegmentUserExpansionChoice {
  identity: string
  expanded: boolean
}

type SupportSegmentRuntimeStatus = 'complete' | 'running' | 'pending' | 'error'

interface ThoughtSupportSegmentPhase {
  kind: 'thoughtPhase'
  key: string
  items: ReasoningRenderItem[]
}

interface ToolSupportSegmentPhase {
  kind: 'toolPhase'
  key: string
  items: ToolCallRenderItem[]
}

interface SingleSupportSegmentPhase {
  kind: 'singleItem'
  key: string
  item: SupportSegmentRenderItem
}

type SupportSegmentPhase =
  | ThoughtSupportSegmentPhase
  | ToolSupportSegmentPhase
  | SingleSupportSegmentPhase

interface SupportSegmentCollapsedPreviewPlan {
  leadingPhases: SupportSegmentPhase[]
  hiddenItems: SupportSegmentRenderItem[]
  hiddenPhases: SupportSegmentPhase[]
  trailingPhases: SupportSegmentPhase[]
}

interface SupportSegmentDisplayPlan {
  fullFlowPhases: SupportSegmentPhase[]
  collapsedPreview: SupportSegmentCollapsedPreviewPlan | null
}

interface ToolPhaseMetrics {
  successCount: number
  totalDurationMs: number
}

const supportSegmentRowAppendTransition: Transition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1]
}

const supportSegmentControlTransition: Transition = {
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1]
}

const baseRowButtonClassName = cn(
  'group flex w-full cursor-pointer justify-start rounded-lg border border-transparent px-1 py-0.5 text-left outline-hidden',
  'transition-[background-color,border-color] duration-150',
  'hover:border-slate-200/56 hover:bg-slate-100/42',
  'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'dark:hover:border-white/7 dark:hover:bg-white/3 dark:focus-visible:ring-slate-500/80'
)

const isToolCallRenderItem = (item: SupportSegmentRenderItem): item is ToolCallRenderItem => (
  item.segment.type === 'toolCall'
)

const isReasoningRenderItem = (item: SupportSegmentRenderItem): item is ReasoningRenderItem => (
  item.segment.type === 'reasoning'
)

const getPhaseKey = (
  kind: ThoughtSupportSegmentPhase['kind'] | ToolSupportSegmentPhase['kind'],
  items: SupportSegmentRenderItem[]
): string => {
  const firstItem = items[0]
  return `${kind}:${firstItem.key}`
}

export const projectSupportSegmentPhases = (
  items: SupportSegmentRenderItem[]
): SupportSegmentPhase[] => {
  const phases: SupportSegmentPhase[] = []
  let activeThoughtItems: ReasoningRenderItem[] = []
  let activeToolItems: ToolCallRenderItem[] = []

  const flushThoughtPhase = () => {
    if (activeThoughtItems.length === 0) {
      return
    }

    phases.push({
      kind: 'thoughtPhase',
      key: getPhaseKey('thoughtPhase', activeThoughtItems),
      items: activeThoughtItems
    })
    activeThoughtItems = []
  }

  const flushToolPhase = () => {
    if (activeToolItems.length === 0) {
      return
    }

    phases.push({
      kind: 'toolPhase',
      key: getPhaseKey('toolPhase', activeToolItems),
      items: activeToolItems
    })
    activeToolItems = []
  }

  items.forEach((item) => {
    if (isReasoningRenderItem(item)) {
      flushToolPhase()
      activeThoughtItems.push(item)
      return
    }

    if (isToolCallRenderItem(item)) {
      flushThoughtPhase()
      activeToolItems.push(item)
      return
    }

    flushThoughtPhase()
    flushToolPhase()
    phases.push({
      kind: 'singleItem',
      key: `singleItem:${item.key}`,
      item
    })
  })

  flushThoughtPhase()
  flushToolPhase()

  return phases
}

const createSupportSegmentDisplayPlan = (
  items: SupportSegmentRenderItem[],
  canCollapse: boolean
): SupportSegmentDisplayPlan => {
  const fullFlowPhases = projectSupportSegmentPhases(items)

  if (!canCollapse) {
    return {
      fullFlowPhases,
      collapsedPreview: null
    }
  }

  const hiddenItems = items.slice(1, -1)

  return {
    fullFlowPhases,
    collapsedPreview: {
      leadingPhases: projectSupportSegmentPhases(items.slice(0, 1)),
      hiddenItems,
      hiddenPhases: projectSupportSegmentPhases(hiddenItems),
      trailingPhases: projectSupportSegmentPhases(items.slice(-1))
    }
  }
}

const getToolCallDurationMs = (
  segment: ToolCallSegment,
  liveNow: number
): number => {
  if (typeof segment.cost === 'number') {
    return Math.max(0, segment.cost)
  }

  const state = getToolCallHeaderState(segment)
  const startedAt = segment.executionStartedAt ?? segment.timestamp

  if (state.isRunning && typeof startedAt === 'number') {
    return Math.max(0, liveNow - startedAt)
  }

  return 0
}

const getThoughtDurationMs = (
  item: ReasoningRenderItem,
  liveNow: number
): number => (
  getReasoningDurationMs(item.segment, item.isStreamingTail, liveNow) ?? 0
)

const formatCompactDurationText = (durationMs: number): string => {
  const normalizedDurationMs = Math.max(0, durationMs)

  if (normalizedDurationMs === 0) {
    return '0s'
  }

  const seconds = normalizedDurationMs / 1000

  if (seconds < 1) {
    return `${seconds.toFixed(3)}s`
  }

  if (seconds < 10) {
    return `${seconds.toFixed(2)}s`
  }

  return `${seconds.toFixed(1)}s`
}

const pluralize = (count: number, singular: string, plural = `${singular}s`): string => (
  `${count} ${count === 1 ? singular : plural}`
)

const getToolCallRuntimeStatus = (segment: ToolCallSegment): SupportSegmentRuntimeStatus => {
  const state = getToolCallHeaderState(segment)

  if (state.isError) return 'error'
  if (state.isRunning) return 'running'
  if (state.isPending) return 'pending'

  return 'complete'
}

const getToolPhaseMetrics = (
  items: ToolCallRenderItem[],
  liveNow: number
): ToolPhaseMetrics => {
  const totalDurationMs = items.reduce((total, item) => (
    total + getToolCallDurationMs(item.segment, liveNow)
  ), 0)
  const statuses = items.map(item => getToolCallRuntimeStatus(item.segment))
  const successCount = statuses.filter(status => status === 'complete').length

  return {
    successCount,
    totalDurationMs
  }
}

const formatCollapsedSupportSegmentSummary = (items: SupportSegmentRenderItem[]): string => {
  const toolCount = items.filter(isToolCallRenderItem).length
  const thoughtCount = items.filter(isReasoningRenderItem).length
  const parts = [
    `${items.length} hidden`,
    toolCount > 0 ? pluralize(toolCount, 'tool') : null,
    thoughtCount > 0 ? pluralize(thoughtCount, 'thought') : null
  ].filter((part): part is string => Boolean(part))

  return `+${parts.join(' · ')}`
}

const getSupportSegmentGroupExpansionPolicy = (
  items: SupportSegmentRenderItem[]
): SupportSegmentGroupExpansionPolicy => {
  if (items.length <= 3) {
    return {
      defaultExpanded: true,
      hasForceExpandedItem: false
    }
  }

  const hasActiveRuntimeItem = items.some((item) => {
    if (isToolCallRenderItem(item)) {
      const state = getToolCallHeaderState(item.segment)
      return state.isRunning || state.isPending
    }

    if (isReasoningRenderItem(item)) {
      return item.isStreamingTail
    }

    return false
  })

  const hasAttentionItem = items.some((item) => {
    if (isToolCallRenderItem(item)) {
      return getToolCallHeaderState(item.segment).isError
    }

    return item.segment.type === 'error'
  })

  return {
    defaultExpanded: hasActiveRuntimeItem || hasAttentionItem,
    hasForceExpandedItem: hasActiveRuntimeItem
  }
}

const getSupportSegmentGroupIdentity = (items: SupportSegmentRenderItem[]): string => (
  items[0] ? `${items[0].layer}:${items[0].key}:${items[0].order}` : 'empty'
)

const hasSameItemIdentity = (
  previous: SupportSegmentRenderItem,
  next: SupportSegmentRenderItem
): boolean => {
  return previous.key === next.key
    && previous.layer === next.layer
    && previous.sourceIndex === next.sourceIndex
    && previous.order === next.order
    && previous.isStreamingTail === next.isStreamingTail
}

const areReasoningSegmentsEqual = (
  previous: ReasoningSegment,
  next: ReasoningSegment
): boolean => {
  return previous.segmentId === next.segmentId
    && previous.content === next.content
    && previous.timestamp === next.timestamp
    && previous.endedAt === next.endedAt
}

export const areSupportSegmentRenderItemsEqual = (
  previous: SupportSegmentRenderItem,
  next: SupportSegmentRenderItem
): boolean => {
  if (!hasSameItemIdentity(previous, next)) return false
  if (previous.segment.type !== next.segment.type) return false

  if (isToolCallRenderItem(previous) && isToolCallRenderItem(next)) {
    return areToolCallSegmentsEqual(previous.segment, next.segment)
  }

  if (isReasoningRenderItem(previous) && isReasoningRenderItem(next)) {
    return areReasoningSegmentsEqual(previous.segment, next.segment)
  }

  if (previous.segment.type === 'error' && next.segment.type === 'error') {
    return previous.segment.segmentId === next.segment.segmentId
      && previous.segment.content === next.segment.content
      && previous.segment.error.name === next.segment.error.name
      && previous.segment.error.message === next.segment.error.message
      && previous.segment.error.code === next.segment.error.code
      && previous.segment.error.stack === next.segment.error.stack
      && previous.segment.error.timestamp === next.segment.error.timestamp
  }

  return previous.segment === next.segment
}

export const areSupportSegmentRenderItemListsEqual = (
  previous: SupportSegmentRenderItem[],
  next: SupportSegmentRenderItem[]
): boolean => {
  if (previous.length !== next.length) return false

  return previous.every((item, index) => areSupportSegmentRenderItemsEqual(item, next[index]))
}

const SupportToolCallGroupRow = memo(({
  item
}: {
  item: ToolCallRenderItem
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const {
    toolResponse,
    isError,
    isPending,
    isRunning,
    statusLabel
  } = getToolCallHeaderState(item.segment)

  return (
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
          data-testid={`support-segment-row-${item.segment.segmentId}`}
          aria-label={getToolCallTriggerAriaLabel(item.segment.name, statusLabel)}
          className={getToolCallTriggerButtonClassName({
            isError,
            isRunning,
            isPending,
            density: 'compact'
          })}
        >
          <ToolCallTriggerContent
            toolCall={item.segment}
            isError={isError}
            isRunning={isRunning}
            isPending={isPending}
            isOpen={isOpen}
            density="compact"
            className="w-full"
          />
        </button>
      )}
    >
      <ToolCallResultPanel
        toolCall={item.segment}
        toolResponse={toolResponse}
      />
    </AssistantSegmentPopout>
  )
}, (prevProps, nextProps) => areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item))

SupportToolCallGroupRow.displayName = 'SupportToolCallGroupRow'

const getReasoningPreviewText = (content: string): string => {
  const previewText = content.replace(/\s+/g, ' ').trim()
  return previewText || 'Open thought'
}

const SupportReasoningGroupRow = memo(({
  item,
  variant = 'header'
}: {
  item: ReasoningRenderItem
  variant?: 'header' | 'preview'
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const fixedContent = fixMalformedCodeBlocks(item.segment.content)
  const durationText = useReasoningDurationText(item.segment, item.isStreamingTail)
  const previewText = useMemo(() => getReasoningPreviewText(fixedContent), [fixedContent])

  return (
    <AssistantSegmentPopout
      open={isOpen}
      onOpenChange={setIsOpen}
      renderTrigger={({ isOpen }) => (
        <button
          type="button"
          data-testid={`support-segment-row-${item.segment.segmentId}`}
          aria-label="Inspect thought process"
          className={cn(
            baseRowButtonClassName,
            variant === 'preview' && 'px-2 py-1'
          )}
        >
          {variant === 'preview' ? (
            <span className="block min-w-0 truncate text-[10.5px] font-medium leading-snug text-slate-500 dark:text-slate-400">
              {previewText}
            </span>
          ) : (
            <SupportSegmentHeader
              icon={Lightbulb}
              name={item.isStreamingTail ? 'Thinking' : 'Thought'}
              duration={durationText}
              tone="neutral"
              density="compact"
              isOpen={isOpen}
              hoverResponse="none"
            />
          )}
        </button>
      )}
    >
      <ReasoningSegmentPanel
        content={item.segment.content}
        fixedContent={fixedContent}
      />
    </AssistantSegmentPopout>
  )
}, (prevProps, nextProps) => (
  prevProps.variant === nextProps.variant
    && areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item)
))

SupportReasoningGroupRow.displayName = 'SupportReasoningGroupRow'

const SupportSegmentGroupRow = memo(({
  item
}: {
  item: SupportSegmentRenderItem
}) => {
  if (isToolCallRenderItem(item)) {
    return <SupportToolCallGroupRow item={item} />
  }

  if (isReasoningRenderItem(item)) {
    return <SupportReasoningGroupRow item={item} />
  }

  if (item.segment.type === 'error') {
    return <ErrorMessage error={item.segment.error} />
  }

  return null
}, (prevProps, nextProps) => areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item))

SupportSegmentGroupRow.displayName = 'SupportSegmentGroupRow'

const SupportPhaseMetricChip = memo(({
  children
}: {
  children: React.ReactNode
}) => (
  <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-slate-100/42 px-1.5 text-[10px] font-medium leading-none text-slate-500 dark:bg-white/4 dark:text-slate-400">
    {children}
  </span>
))

SupportPhaseMetricChip.displayName = 'SupportPhaseMetricChip'

const getThoughtPhaseDurationText = (
  items: ReasoningRenderItem[],
  liveNow: number
): string | undefined => {
  const totalDurationMs = items.reduce((total, item) => (
    total + getThoughtDurationMs(item, liveNow)
  ), 0)

  return formatReasoningDurationText(totalDurationMs || undefined)
}

const SupportThoughtPhase = memo(({
  phase,
  liveNow,
  shouldReduceMotion
}: {
  phase: ThoughtSupportSegmentPhase
  liveNow: number
  shouldReduceMotion: boolean
}) => {
  const isThinking = phase.items.some(item => item.isStreamingTail)
  const durationText = getThoughtPhaseDurationText(phase.items, liveNow)

  return (
    <section
      data-testid="support-segment-phase-thought"
      className="rounded-md border-t border-slate-200/42 px-1 py-1 first:border-t-0 first:pt-0 dark:border-white/7"
    >
      <div
        data-testid="support-segment-phase-header"
        className="flex min-w-0 items-center justify-between gap-2 px-1"
      >
        <SupportSegmentHeader
          icon={Lightbulb}
          name={isThinking ? 'Thinking' : 'Thought'}
          duration={durationText}
          tone="neutral"
          density="compact"
          hoverResponse="none"
        />
        {phase.items.length > 1 ? (
          <span className="shrink-0 text-[10px] font-medium leading-none text-slate-400 dark:text-slate-500">
            {pluralize(phase.items.length, 'step')}
          </span>
        ) : null}
      </div>
      <div className="mt-0.5 flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {phase.items.map(item => (
            <motion.div
              key={item.key}
              layout={shouldReduceMotion ? false : 'position'}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
              transition={supportSegmentRowAppendTransition}
            >
              <SupportReasoningGroupRow
                item={item}
                variant="preview"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
})

SupportThoughtPhase.displayName = 'SupportThoughtPhase'

const SupportToolPhaseTimelineRow = memo(({
  item,
  isFirst,
  isLast,
  showTimeline
}: {
  item: ToolCallRenderItem
  isFirst: boolean
  isLast: boolean
  showTimeline: boolean
}) => (
  <div
    data-testid={showTimeline ? `support-segment-tool-timeline-row-${item.segment.segmentId}` : undefined}
    className={cn('relative', showTimeline && 'pl-3')}
  >
    {showTimeline ? (
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-[3px] w-px bg-slate-200/62 dark:bg-slate-700/50',
          isFirst ? 'top-2.5' : 'top-0',
          isLast ? 'bottom-[calc(100%-0.625rem)]' : 'bottom-0'
        )}
      />
    ) : null}
    {showTimeline ? (
      <span
        aria-hidden="true"
        className="absolute left-0 top-2.5 h-1.5 w-1.5 rounded-full border border-slate-300/75 bg-white dark:border-slate-700/80 dark:bg-slate-950"
      />
    ) : null}
    <SupportToolCallGroupRow item={item} />
  </div>
), (prevProps, nextProps) => (
  prevProps.isFirst === nextProps.isFirst
    && prevProps.isLast === nextProps.isLast
    && prevProps.showTimeline === nextProps.showTimeline
    && areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item)
))

SupportToolPhaseTimelineRow.displayName = 'SupportToolPhaseTimelineRow'

const SupportToolPhase = memo(({
  phase,
  liveNow,
  shouldReduceMotion
}: {
  phase: ToolSupportSegmentPhase
  liveNow: number
  shouldReduceMotion: boolean
}) => {
  const metrics = getToolPhaseMetrics(phase.items, liveNow)
  const totalDurationText = formatCompactDurationText(metrics.totalDurationMs)
  const hasMultipleTools = phase.items.length > 1

  if (phase.items.length === 0) {
    return null
  }

  return (
    <section
      data-testid="support-segment-phase-tool"
      className="rounded-md border-t border-slate-200/42 px-1 py-1 first:border-t-0 first:pt-0 dark:border-white/7"
    >
      <div
        data-testid="support-segment-phase-header"
        className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 px-1"
      >
        <SupportSegmentHeader
          icon={Wrench}
          name="Tool execution"
          duration={pluralize(phase.items.length, 'call')}
          tone="neutral"
          density="compact"
          hoverResponse="none"
        />
        {hasMultipleTools ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <SupportPhaseMetricChip>
              {metrics.successCount}/{phase.items.length} success
            </SupportPhaseMetricChip>
            <SupportPhaseMetricChip>
              {totalDurationText} total
            </SupportPhaseMetricChip>
          </div>
        ) : null}
      </div>
      <div
        data-testid={hasMultipleTools ? 'support-segment-tool-timeline' : undefined}
        className={cn(
          'mt-0.5 flex flex-col',
          hasMultipleTools ? 'gap-1.5' : 'gap-0.5'
        )}
      >
        <AnimatePresence initial={false}>
          {phase.items.map((item, index) => (
            <motion.div
              key={item.key}
              layout={shouldReduceMotion ? false : 'position'}
              initial={shouldReduceMotion ? false : { opacity: 0, y: 3 }}
              animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
              transition={supportSegmentRowAppendTransition}
            >
              <SupportToolPhaseTimelineRow
                item={item}
                isFirst={index === 0}
                isLast={index === phase.items.length - 1}
                showTimeline={hasMultipleTools}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
})

SupportToolPhase.displayName = 'SupportToolPhase'

const SupportSegmentPhaseView = memo(({
  phase,
  liveNow,
  shouldReduceMotion
}: {
  phase: SupportSegmentPhase
  liveNow: number
  shouldReduceMotion: boolean
}) => {
  if (phase.kind === 'thoughtPhase') {
    return <SupportThoughtPhase phase={phase} liveNow={liveNow} shouldReduceMotion={shouldReduceMotion} />
  }

  if (phase.kind === 'toolPhase') {
    return <SupportToolPhase phase={phase} liveNow={liveNow} shouldReduceMotion={shouldReduceMotion} />
  }

  return <SupportSegmentGroupRow item={phase.item} />
})

SupportSegmentPhaseView.displayName = 'SupportSegmentPhaseView'

const getSummaryIconMeta = (item: SupportSegmentRenderItem): {
  Icon: LucideIcon
  className: string
  label: string
  isAnimated?: boolean
} => {
  if (isToolCallRenderItem(item)) {
    const state = getToolCallHeaderState(item.segment)

    if (state.isError) {
      return {
        Icon: X,
        className: 'bg-red-100/85 text-red-700 dark:bg-red-900/24 dark:text-red-300',
        label: `${item.segment.name} failed`
      }
    }

    if (state.isRunning || state.isPending) {
      return {
        Icon: Loader2,
        className: 'bg-amber-100/85 text-amber-700 dark:bg-amber-900/24 dark:text-amber-200',
        label: `${item.segment.name} ${state.statusLabel}`,
        isAnimated: state.isRunning
      }
    }

    return {
      Icon: Check,
      className: 'bg-emerald-100/85 text-emerald-700 dark:bg-emerald-900/24 dark:text-emerald-300',
      label: `${item.segment.name} completed`
    }
  }

  return {
    Icon: Lightbulb,
    className: 'bg-slate-100/85 text-slate-600 dark:bg-white/6 dark:text-slate-300',
    label: 'Thought'
  }
}

const SupportSegmentSummaryIconStrip = memo(({
  items
}: {
  items: SupportSegmentRenderItem[]
}) => {
  const visibleItems = items.slice(0, 8)
  const remainingCount = items.length - visibleItems.length

  return (
    <span
      aria-label={`${items.length} summarized support steps`}
      className="inline-flex min-w-0 items-center gap-0.5"
    >
      {visibleItems.map((item) => {
        const { Icon, className, label, isAnimated } = getSummaryIconMeta(item)

        return (
          <span
            key={item.key}
            title={label}
            className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-md',
              className
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn('h-2.5 w-2.5', isAnimated && 'animate-spin')}
            />
          </span>
        )
      })}
      {remainingCount > 0 ? (
        <span className="ml-0.5 shrink-0 text-[9px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
          +{remainingCount}
        </span>
      ) : null}
    </span>
  )
})

SupportSegmentSummaryIconStrip.displayName = 'SupportSegmentSummaryIconStrip'

const SupportSegmentGroupCollapseRow = memo(({
  onCollapse
}: {
  onCollapse: () => void
}) => (
  <button
    type="button"
    data-testid="support-segment-collapse-row"
    aria-label="Hide support details"
    className={cn(
      'group/collapse mt-0.5 flex w-full items-center justify-between gap-2 rounded-md border-t border-slate-200/42 px-2 py-1 text-left outline-hidden',
      'text-[10px] font-medium leading-none text-slate-400 transition-[background-color,border-color,color] duration-150',
      'hover:border-slate-200/70 hover:bg-slate-100/42 hover:text-slate-500',
      'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'dark:border-white/7 dark:text-slate-500 dark:hover:border-white/10 dark:hover:bg-white/3 dark:hover:text-slate-300 dark:focus-visible:ring-slate-500/80'
    )}
    onClick={onCollapse}
  >
    <span className="min-w-0 truncate">Hide</span>
    <ChevronUp
      aria-hidden="true"
      className="h-3 w-3 shrink-0 text-slate-400 transition-colors duration-150 group-hover/collapse:text-slate-500 dark:text-slate-500 dark:group-hover/collapse:text-slate-300"
    />
  </button>
))

SupportSegmentGroupCollapseRow.displayName = 'SupportSegmentGroupCollapseRow'

const SupportSegmentCollapsedSummaryRow = memo(({
  hiddenItems,
  onExpand
}: {
  hiddenItems: SupportSegmentRenderItem[]
  onExpand: () => void
}) => {
  const summaryText = formatCollapsedSupportSegmentSummary(hiddenItems)

  return (
    <button
      type="button"
      data-testid="support-segment-summary-row"
      aria-label={`Expand ${summaryText}`}
      className={cn(
        'group/summary flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-1 text-left outline-hidden',
        'text-[10px] font-semibold leading-none text-slate-500 transition-[background-color,border-color,color] duration-150',
        'hover:border-slate-200/65 hover:bg-slate-100/58 hover:text-slate-600',
        'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'dark:text-slate-400 dark:hover:border-white/7 dark:hover:bg-white/4 dark:hover:text-slate-200 dark:focus-visible:ring-slate-500/80'
      )}
      onClick={onExpand}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate tabular-nums">{summaryText}</span>
        <ChevronDown
          aria-hidden="true"
          className="h-3 w-3 shrink-0 text-slate-400 transition-colors duration-150 group-hover/summary:text-slate-500 dark:text-slate-500 dark:group-hover/summary:text-slate-300"
        />
      </span>
      <SupportSegmentSummaryIconStrip items={hiddenItems} />
    </button>
  )
})

SupportSegmentCollapsedSummaryRow.displayName = 'SupportSegmentCollapsedSummaryRow'

const SupportSegmentGroupComponent: React.FC<SupportSegmentGroupProps> = ({ items, forceReducedMotion = false }) => {
  const prefersReducedMotion = Boolean(useReducedMotion())
  const shouldReduceMotion = forceReducedMotion || prefersReducedMotion
  const groupIdentity = useMemo(() => getSupportSegmentGroupIdentity(items), [items])
  const expansionPolicy = useMemo(() => getSupportSegmentGroupExpansionPolicy(items), [items])
  const canCollapse = items.length > 3
  const displayPlan = useMemo(() => (
    createSupportSegmentDisplayPlan(items, canCollapse)
  ), [canCollapse, items])
  const hasLiveTiming = useMemo(() => (
    items.some((item) => {
      if (isToolCallRenderItem(item)) {
        return getToolCallHeaderState(item.segment).isRunning
      }

      return isReasoningRenderItem(item) && item.isStreamingTail
    })
  ), [items])
  const [liveNow, setLiveNow] = useState(() => Date.now())
  const [userExpansionChoice, setUserExpansionChoice] = useState<SupportSegmentUserExpansionChoice | null>(null)
  const hasCurrentUserExpansionChoice = userExpansionChoice?.identity === groupIdentity
  const isExpanded = expansionPolicy.hasForceExpandedItem
    ? true
    : hasCurrentUserExpansionChoice
      ? userExpansionChoice.expanded
      : expansionPolicy.defaultExpanded

  useEffect(() => {
    if (expansionPolicy.hasForceExpandedItem && hasCurrentUserExpansionChoice) {
      setUserExpansionChoice(null)
    }
  }, [
    expansionPolicy.hasForceExpandedItem,
    hasCurrentUserExpansionChoice
  ])

  useEffect(() => {
    if (!hasLiveTiming) {
      return
    }

    const timer = window.setInterval(() => {
      setLiveNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasLiveTiming])

  if (items.length === 0) {
    return null
  }

  const shouldRenderCollapsed = canCollapse && !isExpanded
  const onExpand = () => {
    setUserExpansionChoice({
      identity: groupIdentity,
      expanded: true
    })
  }
  const onCollapse = () => {
    setUserExpansionChoice({
      identity: groupIdentity,
      expanded: false
    })
  }

  const renderPhase = (phase: SupportSegmentPhase) => (
    <div key={phase.key}>
      <SupportSegmentPhaseView
        phase={phase}
        liveNow={liveNow}
        shouldReduceMotion={shouldReduceMotion}
      />
    </div>
  )

  return (
    <div
      data-testid="support-segment-group"
      data-state={shouldRenderCollapsed ? 'collapsed' : 'expanded'}
      className="my-1 flex w-full max-w-[680px] flex-col gap-0.5 overflow-hidden rounded-lg border border-slate-200/48 bg-white/34 p-1 dark:border-slate-800/72 dark:bg-white/3 dark:shadow-black/20"
    >
      <div className="flex flex-col gap-0.5">
        {displayPlan.collapsedPreview ? (
          <>
            {displayPlan.collapsedPreview.leadingPhases.map(renderPhase)}
            <SizeAnimatedPanel
              data-testid="support-segment-middle-panel"
              expanded={!shouldRenderCollapsed}
              reducedMotion={shouldReduceMotion}
              contentClassName="flex flex-col gap-0.5"
            >
              {displayPlan.collapsedPreview.hiddenPhases.map(renderPhase)}
            </SizeAnimatedPanel>
            <AnimatePresence initial={false} mode="wait">
              {shouldRenderCollapsed ? (
                <motion.div
                  key="summary"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
                  transition={supportSegmentControlTransition}
                >
                  <SupportSegmentCollapsedSummaryRow
                    hiddenItems={displayPlan.collapsedPreview.hiddenItems}
                    onExpand={onExpand}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
            {displayPlan.collapsedPreview.trailingPhases.map(renderPhase)}
            <AnimatePresence initial={false} mode="wait">
              {shouldRenderCollapsed ? null : (
                <motion.div
                  key="collapse"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 2 }}
                  animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0, y: -2 }}
                  transition={supportSegmentControlTransition}
                >
                  <SupportSegmentGroupCollapseRow
                    onCollapse={onCollapse}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        ) : (
          displayPlan.fullFlowPhases.map(renderPhase)
        )}
      </div>
    </div>
  )
}

export const SupportSegmentGroup = memo(
  SupportSegmentGroupComponent,
  (prevProps, nextProps) => (
    prevProps.forceReducedMotion === nextProps.forceReducedMotion
      && areSupportSegmentRenderItemListsEqual(prevProps.items, nextProps.items)
  )
)

SupportSegmentGroup.displayName = 'SupportSegmentGroup'
