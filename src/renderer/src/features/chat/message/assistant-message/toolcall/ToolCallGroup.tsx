import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { buildToolLiveOutputKey } from '@renderer/features/chat/state/chatRunUiStore'
import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { cn } from '@renderer/shared/lib/utils'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import React, { memo, useEffect, useMemo, useState } from 'react'
import type { SupportSegmentRenderItem } from '../model/assistantMessageMapper'
import {
  areToolCallSegmentsEqual,
  getToolCallHeaderState,
  getToolCallTriggerAriaLabel,
  ToolCallInspectorDetails,
  ToolCallTriggerContent
} from './ToolCallResult'
import { TOOL_CALL_RESULT_WIDTH_CLASS_NAME } from './toolCallLayout'

type ToolCallRenderItem = SupportSegmentRenderItem & { segment: ToolCallSegment }

export interface ToolCallGroupProps {
  items: SupportSegmentRenderItem[]
  forceReducedMotion?: boolean
  fullWidth?: boolean
  nestedDisclosure?: boolean
}

const isToolCallItem = (item: SupportSegmentRenderItem): item is ToolCallRenderItem => (
  item.segment.type === 'toolCall'
)

function areToolCallItemsEqual(
  previous: SupportSegmentRenderItem[],
  next: SupportSegmentRenderItem[]
): boolean {
  return previous.length === next.length && previous.every((item, index) => {
    const nextItem = next[index]
    return item.key === nextItem.key
      && item.layer === nextItem.layer
      && item.order === nextItem.order
      && item.segment.type === 'toolCall'
      && nextItem.segment.type === 'toolCall'
      && areToolCallSegmentsEqual(item.segment, nextItem.segment)
  })
}

function getVisibleToolItems(items: ToolCallRenderItem[], showAll: boolean): {
  visible: ToolCallRenderItem[]
  hiddenCount: number
} {
  if (showAll || items.length <= 8) return { visible: items, hiddenCount: 0 }

  const visibleKeys = new Set([
    ...items.slice(0, 3).map(item => item.key),
    ...items.slice(-3).map(item => item.key),
    ...items.filter(item => {
      const state = getToolCallHeaderState(item.segment)
      return state.isRunning || state.isPending || state.isError
    }).map(item => item.key)
  ])
  const visible = items.filter(item => visibleKeys.has(item.key))
  return { visible, hiddenCount: items.length - visible.length }
}

const ToolCallGroupRow = memo(({
  item,
  expanded,
  onToggle,
  forceReducedMotion = false,
  nestedDisclosure = false
}: {
  item: ToolCallRenderItem
  expanded: boolean
  onToggle: () => void
  forceReducedMotion?: boolean
  nestedDisclosure?: boolean
}) => {
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const selectToolCall = useChatStore(state => state.selectToolCall)
  const prefersReducedMotion = useReducedMotion()
  const shouldReduceMotion = forceReducedMotion || Boolean(prefersReducedMotion)
  const liveOutput = useChatStore(state => {
    if (!currentChatUuid || !item.segment.toolCallId) return undefined
    return state.toolLiveOutputs[buildToolLiveOutputKey(currentChatUuid, item.segment.toolCallId)]
  })
  const { isError, isPending, isRunning, statusLabel, toolResponse } = getToolCallHeaderState(item.segment)
  const detailsId = `tool-call-inline-details-${item.segment.segmentId}`
  const [hasOpened, setHasOpened] = useState(expanded)

  useEffect(() => {
    if (expanded) setHasOpened(true)
  }, [expanded])

  return (
    <motion.div
      data-testid={`tool-call-group-row-${item.segment.segmentId}`}
      className="border-t border-slate-200/28 first:border-t-0 dark:border-white/4"
      initial={shouldReduceMotion ? false : { opacity: 0, x: -6, scale: 0.995 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, scale: 1 }}
      transition={shouldReduceMotion
        ? undefined
        : {
            x: { type: 'spring', stiffness: 420, damping: 38, mass: 0.72 },
            scale: { type: 'spring', stiffness: 420, damping: 38, mass: 0.72 },
            opacity: { duration: 0.14, ease: [0.22, 1, 0.36, 1] }
          }}
    >
      <button
        type="button"
        data-testid={`support-segment-row-${item.segment.segmentId}`}
        aria-label={getToolCallTriggerAriaLabel(item.segment.name, statusLabel)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => {
          if (!expanded && currentChatUuid) {
            selectToolCall({
              chatUuid: currentChatUuid,
              segmentId: item.segment.segmentId,
              toolCallId: item.segment.toolCallId
            })
          }
          onToggle()
        }}
        className={cn(
          'group/support flex w-full min-w-0 cursor-pointer items-center px-2 py-1.5 text-left outline-hidden',
          'transition-colors duration-150 hover:bg-slate-50/55',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65',
          expanded && 'bg-slate-50/45 dark:bg-white/[0.025]',
          'dark:hover:bg-white/[0.025] dark:focus-visible:ring-slate-500/75'
        )}
      >
        <ToolCallTriggerContent
          toolCall={item.segment}
          isError={isError}
          isRunning={isRunning}
          isPending={isPending}
          isSelected={expanded}
          density="compact"
          className="w-full"
          durationClassName={nestedDisclosure
            ? cn(
                'transition-opacity duration-200 group-hover/support:opacity-80 group-focus-visible/support:opacity-80 motion-reduce:transition-none',
                expanded ? 'opacity-80' : 'opacity-[0.45]'
              )
            : undefined}
          trailing={(
            <ChevronDown
              aria-hidden="true"
              data-testid={`tool-call-chevron-${item.segment.segmentId}`}
              className={cn(
                nestedDisclosure
                  ? 'h-3 w-3 transition-[transform,opacity] duration-200 group-hover/support:opacity-80 group-focus-visible/support:opacity-80 motion-reduce:transition-none'
                  : 'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
                expanded && 'rotate-180',
                nestedDisclosure && (expanded ? 'opacity-80' : 'opacity-[0.45]')
              )}
            />
          )}
        />
      </button>
      <SizeAnimatedPanel
        id={detailsId}
        expanded={expanded}
        reducedMotion={shouldReduceMotion}
        data-testid={`tool-call-inline-panel-${item.segment.segmentId}`}
      >
        <div
          data-testid={`tool-call-detail-surface-${item.segment.segmentId}`}
          className="border-t border-slate-200/35 bg-gray-100/45 px-1 py-1 dark:border-white/5 dark:bg-white/2.5"
        >
          {hasOpened || expanded ? (
            <ToolCallInspectorDetails
              toolCall={item.segment}
              toolResponse={toolResponse}
              liveOutput={liveOutput}
            />
          ) : null}
        </div>
      </SizeAnimatedPanel>
    </motion.div>
  )
})

ToolCallGroupRow.displayName = 'ToolCallGroupRow'

const ToolCallGroupComponent: React.FC<ToolCallGroupProps> = ({
  items,
  forceReducedMotion = false,
  fullWidth = false,
  nestedDisclosure = false
}) => {
  const toolItems = useMemo(() => items.filter(isToolCallItem), [items])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const { visible, hiddenCount } = getVisibleToolItems(toolItems, showAll)

  if (toolItems.length === 0) return null

  return (
    <div
      data-testid="tool-call-group"
      className={cn(
        fullWidth ? 'w-full max-w-full' : TOOL_CALL_RESULT_WIDTH_CLASS_NAME,
        'my-2 overflow-hidden rounded-lg border border-slate-200/28 bg-white/30 dark:border-white/4 dark:bg-white/1.5'
      )}
    >
      {visible.map(item => (
        <ToolCallGroupRow
          key={item.key}
          item={item}
          expanded={expandedId === item.segment.segmentId}
          onToggle={() => {
            setExpandedId(current => current === item.segment.segmentId ? null : item.segment.segmentId)
          }}
          forceReducedMotion={forceReducedMotion}
          nestedDisclosure={nestedDisclosure}
        />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="w-full cursor-pointer border-t border-slate-200/45 px-3 py-2 text-left text-[10.5px] font-medium text-slate-500 outline-hidden transition-colors hover:bg-slate-50/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65 dark:border-white/6 dark:text-slate-400 dark:hover:bg-white/[0.025]"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more tool calls
        </button>
      ) : null}
    </div>
  )
}

export const ToolCallGroup = memo(
  ToolCallGroupComponent,
  (previous, next) => (
    previous.forceReducedMotion === next.forceReducedMotion
    && previous.fullWidth === next.fullWidth
    && previous.nestedDisclosure === next.nestedDisclosure
    && areToolCallItemsEqual(previous.items, next.items)
  )
)

ToolCallGroup.displayName = 'ToolCallGroup'
