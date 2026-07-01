import { cn } from '@renderer/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { Check, ChevronDown, ChevronUp, Lightbulb, Loader2, X } from 'lucide-react'
import React, { memo, useEffect, useMemo, useState } from 'react'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { ErrorMessage } from '../../error-message'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import {
  ReasoningSegmentPanel,
  useReasoningDurationText
} from '../segments/ReasoningSegmentNext'
import {
  areToolCallSegmentsEqual,
  getToolCallHeaderState,
  getToolCallTriggerAriaLabel,
  ToolCallHeader,
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
}

interface SupportSegmentGroupSummary {
  stepCount: number
  toolCount: number
  thoughtCount: number
}

interface SupportSegmentGroupExpansionPolicy {
  defaultExpanded: boolean
  hasForceExpandedItem: boolean
}

const baseRowButtonClassName = cn(
  'group flex w-full cursor-pointer justify-start rounded-lg border border-transparent px-1 py-0.5 text-left outline-hidden',
  'transition-[background-color,border-color] duration-150',
  'hover:border-slate-200/65 hover:bg-slate-100/58',
  'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'dark:hover:border-white/7 dark:hover:bg-white/4 dark:focus-visible:ring-slate-500/80'
)

const isToolCallRenderItem = (item: SupportSegmentRenderItem): item is ToolCallRenderItem => (
  item.segment.type === 'toolCall'
)

const isReasoningRenderItem = (item: SupportSegmentRenderItem): item is ReasoningRenderItem => (
  item.segment.type === 'reasoning'
)

const getSupportSegmentGroupSummary = (
  items: SupportSegmentRenderItem[]
): SupportSegmentGroupSummary => {
  return items.reduce<SupportSegmentGroupSummary>((summary, item) => {
    if (item.segment.type === 'toolCall') {
      summary.toolCount += 1
    }

    if (item.segment.type === 'reasoning') {
      summary.thoughtCount += 1
    }

    return summary
  }, {
    stepCount: items.length,
    toolCount: 0,
    thoughtCount: 0
  })
}

const formatSupportSegmentGroupSummary = (summary: SupportSegmentGroupSummary): string => (
  `${summary.toolCount} Tool(s) and ${summary.thoughtCount} Thought(s)`
)

const getSupportSegmentGroupExpansionPolicy = (
  items: SupportSegmentRenderItem[]
): SupportSegmentGroupExpansionPolicy => {
  if (items.length <= 3) {
    return {
      defaultExpanded: true,
      hasForceExpandedItem: false
    }
  }

  const hasForceExpandedItem = items.some((item) => {
    if (!isToolCallRenderItem(item)) {
      return false
    }

    const state = getToolCallHeaderState(item.segment)
    return state.isRunning || state.isPending || state.isError
  })

  return {
    defaultExpanded: hasForceExpandedItem,
    hasForceExpandedItem
  }
}

const getSupportSegmentGroupIdentity = (items: SupportSegmentRenderItem[]): string => (
  items.map(item => item.key).join('\u001f')
)

const getSupportSegmentGroupStatusSignature = (items: SupportSegmentRenderItem[]): string => (
  items.map((item) => {
    if (isToolCallRenderItem(item)) {
      return `${item.key}:${getToolCallHeaderState(item.segment).statusLabel}`
    }

    return `${item.key}:${item.segment.type}:${item.isStreamingTail ? 'streaming' : 'settled'}`
  }).join('\u001f')
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
          className={baseRowButtonClassName}
        >
          <ToolCallHeader
            name={item.segment.name}
            isError={isError}
            isRunning={isRunning}
            isPending={isPending}
            isOpen={isOpen}
            cost={item.segment.cost}
            runningStartedAt={item.segment.executionStartedAt ?? item.segment.timestamp}
            density="compact"
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

const SupportReasoningGroupRow = memo(({
  item
}: {
  item: ReasoningRenderItem
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const fixedContent = fixMalformedCodeBlocks(item.segment.content)
  const durationText = useReasoningDurationText(item.segment, item.isStreamingTail)

  return (
    <AssistantSegmentPopout
      open={isOpen}
      onOpenChange={setIsOpen}
      renderTrigger={({ isOpen }) => (
        <button
          type="button"
          data-testid={`support-segment-row-${item.segment.segmentId}`}
          aria-label="Inspect thought process"
          className={baseRowButtonClassName}
        >
          <SupportSegmentHeader
            icon={Lightbulb}
            name="Thought"
            duration={durationText}
            tone="neutral"
            density="compact"
            isOpen={isOpen}
          />
        </button>
      )}
    >
      <ReasoningSegmentPanel
        content={item.segment.content}
        fixedContent={fixedContent}
      />
    </AssistantSegmentPopout>
  )
}, (prevProps, nextProps) => areSupportSegmentRenderItemsEqual(prevProps.item, nextProps.item))

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

const SupportSegmentGroupSummaryHeader = memo(({
  summaryText,
  onCollapse
}: {
  summaryText: string
  onCollapse: () => void
}) => (
  <button
    type="button"
    data-testid="support-segment-summary-header"
    aria-label={`Collapse support group, ${summaryText}`}
    className={cn(
      'group/header mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-4 py-1 text-left outline-hidden',
      'text-[10px] font-semibold leading-none text-slate-400 transition-[background-color,color] duration-150',
      'hover:bg-slate-100/52 hover:text-slate-500',
      'focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'dark:text-slate-500 dark:hover:bg-white/4 dark:hover:text-slate-300 dark:focus-visible:ring-slate-500/80'
    )}
    onClick={onCollapse}
  >
    <span className="min-w-0 truncate">{summaryText}</span>
    <ChevronUp
      aria-hidden="true"
      className="h-3 w-3 shrink-0 text-slate-400 transition-colors duration-150 group-hover/header:text-slate-500 dark:text-slate-500 dark:group-hover/header:text-slate-300"
    />
  </button>
))

SupportSegmentGroupSummaryHeader.displayName = 'SupportSegmentGroupSummaryHeader'

const SupportSegmentCollapsedSummaryRow = memo(({
  hiddenItems,
  onExpand
}: {
  hiddenItems: SupportSegmentRenderItem[]
  onExpand: () => void
}) => (
  <button
    type="button"
    data-testid="support-segment-summary-row"
    aria-label={`Expand ${hiddenItems.length} summarized support steps`}
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
      <span className="shrink-0 tabular-nums">+{hiddenItems.length} steps</span>
      <ChevronDown
        aria-hidden="true"
        className="h-3 w-3 shrink-0 text-slate-400 transition-colors duration-150 group-hover/summary:text-slate-500 dark:text-slate-500 dark:group-hover/summary:text-slate-300"
      />
    </span>
    <SupportSegmentSummaryIconStrip items={hiddenItems} />
  </button>
))

SupportSegmentCollapsedSummaryRow.displayName = 'SupportSegmentCollapsedSummaryRow'

const SupportSegmentGroupComponent: React.FC<SupportSegmentGroupProps> = ({ items }) => {
  const groupIdentity = useMemo(() => getSupportSegmentGroupIdentity(items), [items])
  const groupStatusSignature = useMemo(() => getSupportSegmentGroupStatusSignature(items), [items])
  const expansionPolicy = useMemo(() => getSupportSegmentGroupExpansionPolicy(items), [items])
  const summary = useMemo(() => getSupportSegmentGroupSummary(items), [items])
  const summaryText = useMemo(() => formatSupportSegmentGroupSummary(summary), [summary])
  const [isExpanded, setIsExpanded] = useState(() => expansionPolicy.defaultExpanded)
  const [hasUserExpansionChoice, setHasUserExpansionChoice] = useState(false)
  const [trackedGroupIdentity, setTrackedGroupIdentity] = useState(groupIdentity)

  useEffect(() => {
    if (trackedGroupIdentity !== groupIdentity) {
      setTrackedGroupIdentity(groupIdentity)
      setHasUserExpansionChoice(false)
      setIsExpanded(expansionPolicy.defaultExpanded)
      return
    }

    if (expansionPolicy.hasForceExpandedItem) {
      setHasUserExpansionChoice(false)
      setIsExpanded(true)
      return
    }

    if (!hasUserExpansionChoice) {
      setIsExpanded(expansionPolicy.defaultExpanded)
    }
  }, [
    expansionPolicy.defaultExpanded,
    expansionPolicy.hasForceExpandedItem,
    groupIdentity,
    groupStatusSignature,
    hasUserExpansionChoice,
    trackedGroupIdentity
  ])

  if (items.length === 0) {
    return null
  }

  const canCollapse = items.length > 3
  const shouldRenderCollapsed = canCollapse && !isExpanded
  const hiddenItems = shouldRenderCollapsed ? items.slice(1, -1) : []
  const onExpand = () => {
    setHasUserExpansionChoice(true)
    setIsExpanded(true)
  }
  const onCollapse = () => {
    setHasUserExpansionChoice(true)
    setIsExpanded(false)
  }

  return (
    <div
      data-testid="support-segment-group"
      className="my-1 flex w-fit max-w-full flex-col gap-0.5 rounded-lg border border-slate-200/48 bg-white/36 p-1 dark:border-slate-800/72 dark:bg-white/3 dark:shadow-black/20"
    >
      {canCollapse && isExpanded ? (
        <SupportSegmentGroupSummaryHeader
          summaryText={summaryText}
          onCollapse={onCollapse}
        />
      ) : null}
      {shouldRenderCollapsed ? (
        <>
          <SupportSegmentGroupRow key={items[0].key} item={items[0]} />
          <SupportSegmentCollapsedSummaryRow
            hiddenItems={hiddenItems}
            onExpand={onExpand}
          />
          <SupportSegmentGroupRow key={items[items.length - 1].key} item={items[items.length - 1]} />
        </>
      ) : (
        items.map(item => (
          <SupportSegmentGroupRow key={item.key} item={item} />
        ))
      )}
    </div>
  )
}

export const SupportSegmentGroup = memo(
  SupportSegmentGroupComponent,
  (prevProps, nextProps) => areSupportSegmentRenderItemListsEqual(prevProps.items, nextProps.items)
)

SupportSegmentGroup.displayName = 'SupportSegmentGroup'
