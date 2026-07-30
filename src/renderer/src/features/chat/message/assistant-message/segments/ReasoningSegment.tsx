import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { cn } from '@renderer/shared/lib/utils'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

interface ReasoningSegmentProps {
  segment: ReasoningSegment
  isStreaming?: boolean
}

interface ReasoningSegmentPanelProps {
  fixedContent: string
}

export const ReasoningSegmentPanel: React.FC<ReasoningSegmentPanelProps> = ({
  fixedContent
}) => {
  return (
    <div
      data-testid="reasoning-think-content"
      className="relative border-l border-slate-200/70 pl-3 dark:border-white/8"
    >
      <div
        className="max-h-[min(456px,calc(100vh-160px))] overflow-y-auto overscroll-contain pr-1 custom-scrollbar"
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkPreserveLineBreaks]}
          skipHtml={false}
          className={cn(
            'prose prose-sm max-w-none',
            'prose-slate dark:prose-invert',
            'text-[12.5px] leading-6 text-slate-500 dark:text-slate-300',
            'prose-p:my-1.5 prose-p:leading-6',
            'prose-code:rounded-sm prose-code:bg-slate-200/38 prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-code:text-slate-700',
            'dark:prose-code:bg-slate-800/52 dark:prose-code:text-slate-200',
            'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-slate-700',
            'prose-strong:font-semibold prose-strong:text-slate-700 dark:prose-strong:text-slate-100'
          )}
        >
          {fixedContent}
        </ReactMarkdown>
      </div>
    </div>
  )
}

export function getReasoningDurationMs(
  segment: ReasoningSegment,
  isStreaming: boolean,
  liveNow: number
): number | undefined {
  if (typeof segment.timestamp !== 'number') return undefined
  if (typeof segment.endedAt === 'number' && segment.endedAt >= segment.timestamp) {
    return segment.endedAt - segment.timestamp
  }
  if (isStreaming) return Math.max(0, liveNow - segment.timestamp)
  return undefined
}

export function formatReasoningDurationText(durationMs: number | undefined): string | undefined {
  return durationMs != null ? `${Math.max(1, Math.ceil(durationMs / 1000))}s` : undefined
}

export function useReasoningDurationText(
  segment: ReasoningSegment,
  isStreaming: boolean
): string | undefined {
  const [liveNow, setLiveNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!isStreaming) return
    setLiveNow(Date.now())
    const timer = window.setInterval(() => setLiveNow(Date.now()), 250)
    return (): void => window.clearInterval(timer)
  }, [isStreaming])

  const durationMs = React.useMemo(
    () => getReasoningDurationMs(segment, isStreaming, liveNow),
    [isStreaming, liveNow, segment]
  )
  return formatReasoningDurationText(durationMs)
}

const ReasoningSegmentComponent: React.FC<ReasoningSegmentProps> = ({
  segment,
  isStreaming = false
}) => {
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const [isOpen, setIsOpen] = React.useState(isStreaming)
  const hasUserChoice = React.useRef(false)
  const shouldReduceMotion = useReducedMotion()
  const durationText = useReasoningDurationText(segment, isStreaming)
  const panelId = React.useId()

  React.useEffect(() => {
    if (!hasUserChoice.current) setIsOpen(isStreaming)
  }, [isStreaming])

  return (
    <div data-testid="reasoning-segment" className="my-1.5 w-full max-w-[760px] px-2">
      <button
        type="button"
        aria-label="Toggle think"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => {
          hasUserChoice.current = true
          setIsOpen(current => !current)
        }}
        className={cn(
          'group flex w-full cursor-pointer items-center gap-2 rounded-md py-1 text-left outline-hidden',
          'bg-transparent transition-colors',
          'focus-visible:ring-2 focus-visible:ring-slate-400/65 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-slate-500/75'
        )}
      >
        <span
          data-testid="reasoning-label"
          className={cn(
            'shrink-0 text-[11px] font-medium transition-colors',
            'text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400',
            isOpen && 'text-slate-500 dark:text-slate-400'
          )}
        >
          Think
        </span>
        {durationText ? (
          <span
            data-testid="reasoning-duration"
            className="shrink-0 text-[10px] font-medium tabular-nums text-slate-300 transition-colors group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-500"
          >
            {durationText}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          data-testid="reasoning-hairline"
          className="h-px min-w-6 flex-1 bg-slate-200/55 transition-colors group-hover:bg-slate-300/55 dark:bg-white/8 dark:group-hover:bg-white/12"
        />
        <ChevronDown
          aria-hidden="true"
          data-testid="reasoning-chevron"
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-slate-300 transition-[color,transform] duration-200 group-hover:text-slate-400 dark:text-slate-600 dark:group-hover:text-slate-500 motion-reduce:transition-none',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <SizeAnimatedPanel
        id={panelId}
        expanded={isOpen}
        reducedMotion={Boolean(shouldReduceMotion)}
        className="mt-1"
        data-testid="reasoning-inline-panel"
      >
        <div className="py-2">
          <ReasoningSegmentPanel fixedContent={fixedContent} />
        </div>
      </SizeAnimatedPanel>
    </div>
  )
}

export const ReasoningSegment = memo(ReasoningSegmentComponent)
ReasoningSegment.displayName = 'ReasoningSegment'
