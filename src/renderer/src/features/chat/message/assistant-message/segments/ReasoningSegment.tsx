import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { SizeAnimatedPanel } from '@renderer/shared/components/ui/size-animated-panel'
import { formatDuration } from '@renderer/shared/lib/formatDuration'
import { cn } from '@renderer/shared/lib/utils'
import { StreamingMarkdownLite } from '@renderer/features/chat/message/typewriter/StreamingMarkdownLite'
import { useReasoningTypewriter } from '@renderer/features/chat/message/typewriter/useReasoningTypewriter'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

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
  inline?: boolean
}

const REASONING_PROSE_CLASS_NAME = cn(
  'prose prose-sm max-w-none',
  'prose-slate dark:prose-invert',
  'text-[12.5px] leading-6 text-slate-500 dark:text-(--chat-text-body)',
  'prose-p:my-1.5 prose-p:leading-6',
  'prose-code:rounded-sm prose-code:bg-slate-200/38 prose-code:px-1 prose-code:py-0.5 prose-code:text-[10px] prose-code:text-slate-700',
  'dark:prose-code:bg-(--chat-surface-raised) dark:prose-code:text-(--chat-text-body)',
  'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-(--chat-border-subtle)',
  'prose-strong:font-semibold prose-strong:text-slate-700 dark:prose-strong:text-(--chat-text-primary)'
)

export const ReasoningSegmentPanel: React.FC<ReasoningSegmentPanelProps> = ({
  content,
  streamingPresentation,
  inline = false
}) => {
  const fixedContent = React.useMemo(() => fixMalformedCodeBlocks(content), [content])

  return (
    <div
      data-testid="reasoning-think-content"
      className={cn(
        'relative',
        inline ? '[&_.prose>:first-child]:mt-0' : 'border-l border-slate-200/70 pl-3 dark:border-(--chat-border-standard)'
      )}
    >
      <div
        className="max-h-[min(456px,calc(100vh-160px))] overflow-y-auto pr-1"
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
  return durationMs != null ? formatDuration(Math.max(1, Math.ceil(durationMs / 1000))) : undefined
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
  nestedDisclosure = false,
  onTypingChange
}) => {
  const [isOpen, setIsOpen] = React.useState(isStreaming)
  const wasStreaming = React.useRef(isStreaming)
  const shouldReduceMotion = useReducedMotion()
  const durationText = useReasoningDurationText(segment, isStreaming)
  const panelId = React.useId()
  const shouldUseStreamingPresentation = isStreaming && !shouldReduceMotion
  const { visibleContent } = useReasoningTypewriter({
    segmentId: segment.segmentId,
    content: segment.content,
    enabled: isStreaming && (isOpen || nestedDisclosure) && !shouldReduceMotion,
    isStreaming,
    reducedMotion: Boolean(shouldReduceMotion),
    onTypingChange
  })
  const panelContent = shouldUseStreamingPresentation && (isOpen || nestedDisclosure)
    ? visibleContent
    : segment.content

  React.useLayoutEffect(() => {
    if (nestedDisclosure || wasStreaming.current === isStreaming) return
    wasStreaming.current = isStreaming
    setIsOpen(isStreaming)
  }, [isStreaming, nestedDisclosure])

  if (nestedDisclosure) {
    const content = panelContent.trim()
    const firstSentence = content.match(/^.*?(?:[。！？!?]+|\.+(?=\s|$)|\n|$)/s)?.[0].trim() ?? content
    const preview = firstSentence + (firstSentence.length < content.length ? '…' : '')

    return (
      <div data-testid="reasoning-segment" className="px-2 py-1 text-[12.5px] leading-6 text-slate-500 dark:text-(--chat-text-secondary)">
        <div className="relative flex items-start gap-2">
          {isOpen && (
            <div
              data-testid="reasoning-guide"
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-[6.5px] top-6 border-l border-slate-200/70 dark:border-(--chat-border-standard)"
            />
          )}
          <button
            type="button"
            aria-label={isOpen ? 'Collapse thinking' : 'Expand thinking'}
            aria-expanded={isOpen}
            aria-controls={isOpen ? panelId : undefined}
            onClick={() => setIsOpen(value => !value)}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-sm text-left hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-400 dark:hover:text-(--chat-text-body)',
              isOpen ? 'shrink-0' : 'w-full'
            )}
          >
            <ChevronRight
              aria-hidden="true"
              className={cn('mt-1.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-(--chat-text-secondary)', isOpen && 'rotate-90')}
            />
            {!isOpen && <span className="min-w-0 wrap-break-word">{preview}</span>}
          </button>
          {isOpen && (
            <div id={panelId} className="min-w-0 flex-1">
              <ReasoningSegmentPanel
                content={panelContent}
                streamingPresentation={shouldUseStreamingPresentation}
                inline
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="reasoning-segment"
      className="my-1.5 w-full max-w-full"
    >
      <button
        type="button"
        aria-label={`Toggle ${isStreaming ? 'Thinking' : 'Thought'}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(current => !current)}
        className={cn(
          'group/support flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left outline-hidden',
          'text-slate-500 dark:text-(--chat-text-body)',
          'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400/65 dark:focus-visible:ring-slate-500/75'
        )}
      >
        <span
          data-testid="reasoning-label"
          className="shrink-0 text-[10.5px] font-semibold leading-none tracking-wide"
        >
          {isStreaming ? 'Thinking' : 'Thought'}
        </span>
        {durationText ? (
          <span
            data-testid="reasoning-duration"
            className={cn(
              'shrink-0 text-[10.5px] font-medium leading-none tabular-nums text-slate-400 dark:text-(--chat-text-secondary)',
              'ml-auto',
              nestedDisclosure && cn(
                'transition-opacity duration-200 group-hover/support:opacity-80 group-focus-visible/support:opacity-80 motion-reduce:transition-none select-none',
                isOpen ? 'opacity-80' : 'opacity-[0.45]'
              )
            )}
          >
          {durationText}
          </span>
        ) : null}
        <span
          data-testid="reasoning-chevron"
          className={cn(
            'inline-flex shrink-0 items-center justify-center text-slate-400 dark:text-(--chat-text-secondary)',
            !durationText && 'ml-auto'
          )}
        >
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
        </span>
      </button>
      <div
        data-testid="reasoning-hairline"
        className="w-full border-b border-slate-200/70 dark:border-(--chat-border-subtle)"
      />
      <SizeAnimatedPanel
        id={panelId}
        expanded={isOpen}
        reducedMotion={Boolean(shouldReduceMotion)}
        className="mt-1"
        data-testid="reasoning-inline-panel"
      >
        <div className="px-2 py-2">
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
