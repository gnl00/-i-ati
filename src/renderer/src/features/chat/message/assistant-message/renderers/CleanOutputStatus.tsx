import './CleanOutputStatus.css'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  LoaderCircle,
  ShieldCheck,
  MessageCircleQuestion,
  Square,
  ChevronRight
} from 'lucide-react'
import type { CleanOutputProgress } from '../model/cleanOutput'
import { useEffect, useId, useRef, useState } from 'react'

import { AssistantSupportSegmentList } from './AssistantSupportSegmentList'
import { buildSupportRenderUnits } from '../model/assistantSupportGrouping'
import { ReasoningSegmentPanel } from '../segments/ReasoningSegment'
import { useReasoningTypewriter } from '../../typewriter/useReasoningTypewriter'
import { WorkProgressMetadata } from './WorkProgressMetadata'
import { AssistantTextSegmentContent } from './AssistantTextSegmentContent'

type TextDetail = Extract<NonNullable<CleanOutputProgress['detail']>, { kind: 'thinking' | 'writing' }>

function CleanOutputDetailText({ detail }: { detail: TextDetail }): React.ReactElement {
  const reducedMotion = Boolean(useReducedMotion())
  const segmentId = detail.kind === 'thinking' ? detail.segmentId : detail.segment.segmentId
  const content = detail.kind === 'thinking' ? detail.content : detail.segment.content
  // Local preview playback does not mark the final answer's typewriter complete.
  const { visibleContent, isTyping } = useReasoningTypewriter({
    segmentId,
    content,
    enabled: !reducedMotion,
    isStreaming: true,
    reducedMotion
  })
  return detail.kind === 'thinking'
    ? <ReasoningSegmentPanel content={visibleContent} streamingPresentation={!reducedMotion} inline />
    : <AssistantTextSegmentContent segment={detail.segment} visibleText={visibleContent} isTyping={isTyping} animateOnMount={false} />
}

const phaseIcons = {
  working: LoaderCircle,
  thinking: LoaderCircle,
  tool: LoaderCircle,
  writing: LoaderCircle,
  approval: ShieldCheck,
  question: MessageCircleQuestion,
  cancelling: Square
}

export function CleanOutputStatus({
  progress, startedAt, endedAt
}: {
  progress: CleanOutputProgress
  startedAt?: number
  endedAt?: number
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const reducedMotion = useReducedMotion()
  const [display, setDisplay] = useState(progress)
  const latestProgress = useRef(progress)
  latestProgress.current = progress
  const urgent = ['cancelling', 'approval', 'question'].includes(progress.phase)
  useEffect(() => {
    if (urgent || reducedMotion) {
      setDisplay(progress)
    }
  }, [urgent, reducedMotion, progress])
  useEffect(() => {
    if (urgent || reducedMotion) return
    // Sample the latest target once per transition, without replaying obsolete states.
    const timer = window.setInterval(
      () => setDisplay(latestProgress.current),
      150
    )
    return (): void => window.clearInterval(timer)
  }, [urgent, reducedMotion])
  const accessibleLabel = display.toolCount
    ? `${display.label} ${display.toolCount} ${display.toolCount === 1 ? 'tool' : 'tools'}`
    : display.label
  const Icon = phaseIcons[display.phase]
  const busy = !['approval', 'question', 'cancelling'].includes(display.phase)
  const detail = display.detail
  const expandable = Boolean(detail)
  const isOpen = expandable && expanded
  const Row = expandable ? 'button' : 'div'
  return (
    <div className="my-1.5 min-w-0">
      <Row
        type={expandable ? 'button' : undefined}
        aria-expanded={expandable ? isOpen : undefined}
        aria-controls={expandable ? panelId : undefined}
        onClick={
          expandable ? (): void => setExpanded((value) => !value) : undefined
        }
        className={`flex h-7 w-fit max-w-full min-w-0 select-none items-center gap-2 overflow-hidden rounded-md px-2 text-left text-xs text-(--chat-text-secondary)${expandable ? ' cursor-pointer hover:bg-(--chat-surface-hover) focus-visible:outline-2 focus-visible:outline-slate-400' : ''}`}
      >
        <span
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-label={accessibleLabel}
        >
          {accessibleLabel}
        </span>
        <span
          aria-hidden="true"
          className="inline-flex h-3.5 w-3.5 shrink-0"
          data-phase={display.phase}
        >
          <Icon
            className={`h-full w-full${busy && !reducedMotion ? ' motion-safe:animate-spin' : ''}`}
          />
        </span>
        <WorkProgressMetadata startedAt={startedAt} endedAt={endedAt} running durationBadge />
        <span aria-hidden="true" className="relative min-w-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={display.label}
              className="block min-w-0"
              initial={reducedMotion || urgent ? false : { opacity: 0, y: 4, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={reducedMotion || urgent ? { opacity: 0 } : { opacity: 0, y: -4, filter: 'blur(2px)' }}
              transition={{ duration: reducedMotion || urgent ? 0 : 0.15, ease: 'easeInOut' }}
            >
              <span
                className="clean-status-label"
                data-text={display.label}
                data-shimmer={busy}
              >{display.label}</span>
            </motion.span>
          </AnimatePresence>
        </span>
        <WorkProgressMetadata toolCount={display.toolCount} />
        {expandable && (
          <ChevronRight
            aria-hidden="true"
            className={`h-3 w-3 shrink-0${isOpen ? ' rotate-90' : ''}`}
          />
        )}
      </Row>
      {expandable && (
        <div
          id={panelId}
          hidden={!isOpen}
          className={`min-w-0 select-text pb-1 pt-1${detail?.kind === 'tool' ? '' : ' pl-7 pr-2'}`}
        >
          {isOpen && detail && (detail.kind === 'thinking' || detail.kind === 'writing') && (
            <CleanOutputDetailText
              key={`${detail.kind}:${detail.kind === 'thinking' ? detail.segmentId : detail.segment.segmentId}`}
              detail={detail}
            />
          )}
          {isOpen && detail?.kind === 'tool' && (
            <AssistantSupportSegmentList
              units={buildSupportRenderUnits(detail.items)}
              nestedDisclosure
            />
          )}
        </div>
      )}
    </div>
  )
}
