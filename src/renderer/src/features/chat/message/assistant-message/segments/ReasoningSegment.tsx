import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useReducedMotion } from 'framer-motion'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { cn } from '@renderer/shared/lib/utils'
import { StreamingMarkdownLite } from '@renderer/features/chat/message/typewriter/StreamingMarkdownLite'
import { useReasoningTypewriter } from '@renderer/features/chat/message/typewriter/useReasoningTypewriter'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'
import { SupportSegmentHeader } from '../renderers/SupportSegmentHeader'

interface ReasoningSegmentProps {
  segment: ReasoningSegment
  isStreaming?: boolean
  fullWidth?: boolean
  nestedDisclosure?: boolean
  onTypingChange?: () => void
}

interface ReasoningSegmentPanelProps {
  content: string
  streamingPresentation: boolean
}

const REASONING_PROSE_CLASS_NAME = cn(
  'prose prose-sm max-w-none',
  'prose-slate dark:prose-invert',
  'text-[12.5px] leading-6 text-slate-500 dark:text-slate-300',
  'prose-p:my-1.5 prose-p:leading-6',
  'prose-code:rounded-sm prose-code:bg-slate-200/38 prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-code:text-slate-700',
  'dark:prose-code:bg-slate-800/52 dark:prose-code:text-slate-200',
  'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-slate-700',
  'prose-strong:font-semibold prose-strong:text-slate-700 dark:prose-strong:text-slate-100'
)

export const ReasoningSegmentPanel: React.FC<ReasoningSegmentPanelProps> = ({
  content,
  streamingPresentation
}) => {
  const fixedContent = React.useMemo(() => fixMalformedCodeBlocks(content), [content])

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
        {streamingPresentation ? (
          <StreamingMarkdownLite
            text={fixedContent}
            className={REASONING_PROSE_CLASS_NAME}
            animate={false}
          />
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkPreserveLineBreaks]}
            skipHtml={false}
            className={REASONING_PROSE_CLASS_NAME}
          >
            {fixedContent}
          </ReactMarkdown>
        )}
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
  isStreaming = false,
  fullWidth = false,
  nestedDisclosure = false,
  onTypingChange
}) => {
  const [isOpen, setIsOpen] = React.useState(isStreaming)
  const hasUserChoice = React.useRef(false)
  const shouldReduceMotion = useReducedMotion()
  const durationText = useReasoningDurationText(segment, isStreaming)
  const panelId = React.useId()
  const shouldUseStreamingPresentation = isStreaming && !Boolean(shouldReduceMotion)
  const { visibleContent } = useReasoningTypewriter({
    segmentId: segment.segmentId,
    content: segment.content,
    enabled: isStreaming && isOpen && !Boolean(shouldReduceMotion),
    isStreaming,
    reducedMotion: Boolean(shouldReduceMotion),
    onTypingChange
  })
  const panelContent = shouldUseStreamingPresentation && isOpen
    ? visibleContent
    : segment.content

  React.useEffect(() => {
    if (!hasUserChoice.current) setIsOpen(isStreaming)
  }, [isStreaming])

  return (
    <div
      data-testid="reasoning-segment"
      className={cn(
        'my-1.5 max-w-full px-2',
        fullWidth ? 'w-full' : 'w-[90%]'
      )}
    >
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
          'group/support flex w-full cursor-pointer items-center border-b py-1.5 text-left shadow-none outline-hidden',
          'bg-transparent transition-[background-color,border-color] duration-150 ease-out',
          'hover:border-slate-200/50 hover:bg-slate-50/55 dark:hover:border-white/8 dark:hover:bg-white/[0.025]',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65 dark:focus-visible:ring-slate-500/75',
          isOpen
            ? 'border-slate-200/50 bg-slate-50/45 dark:border-white/8 dark:bg-white/[0.025]'
            : 'border-slate-200/30 dark:border-white/5'
        )}
      >
        <SupportSegmentHeader
          icon={Lightbulb}
          name="Think"
          description={isStreaming ? 'Reasoning in progress' : undefined}
          duration={durationText}
          durationClassName={nestedDisclosure
            ? cn(
                'transition-opacity duration-200 group-hover/support:opacity-80 group-focus-visible/support:opacity-80 motion-reduce:transition-none',
                isOpen ? 'opacity-80' : 'opacity-[0.45]'
              )
            : undefined}
          isOpen={isOpen}
          trailing={(
            <ChevronDown
              aria-hidden="true"
              className={cn(
                nestedDisclosure
                  ? 'h-3 w-3 transition-[transform,opacity] duration-200 group-hover/support:opacity-80 group-focus-visible/support:opacity-80 motion-reduce:transition-none'
                  : 'h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none',
                isOpen && 'rotate-180',
                nestedDisclosure && (isOpen ? 'opacity-80' : 'opacity-[0.45]')
              )}
            />
          )}
          testIds={{
            icon: 'reasoning-icon',
            name: 'reasoning-label',
            description: 'reasoning-description',
            duration: 'reasoning-duration',
            trailing: 'reasoning-chevron'
          }}
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
          <ReasoningSegmentPanel
            content={panelContent}
            streamingPresentation={shouldUseStreamingPresentation}
          />
        </div>
      </SizeAnimatedPanel>
    </div>
  )
}

export const ReasoningSegment = memo(ReasoningSegmentComponent)
ReasoningSegment.displayName = 'ReasoningSegment'
