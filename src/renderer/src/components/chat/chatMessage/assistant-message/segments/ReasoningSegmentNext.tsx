import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { BrainCircuit, Clipboard, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'
import { AssistantSegmentPopout } from '../renderers/AssistantSegmentPopout'

interface ReasoningSegmentNextProps {
  segment: ReasoningSegment
  isStreaming?: boolean
}

interface ReasoningSegmentPanelProps {
  content: string
  fixedContent: string
}

const ReasoningSegmentPanel: React.FC<ReasoningSegmentPanelProps> = ({
  content,
  fixedContent
}) => {
  const onCopyClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    void navigator.clipboard.writeText(content)
    toast.success('Thought Copied')
  }

  return (
    <div data-testid="reasoning-thought-popout" className="relative overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200/55 bg-slate-50/56 px-3 py-1.5 dark:border-slate-800/55 dark:bg-slate-900/36">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-slate-200/55 text-slate-600 dark:bg-white/6 dark:text-slate-300">
            <BrainCircuit className="h-3 w-3" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Output
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Copy thought"
          className="h-7 w-7 rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
          onClick={onCopyClick}
        >
          <Clipboard className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
        </Button>
      </div>

      <div
        className="max-h-[min(456px,calc(100vh-160px))] overflow-y-auto overscroll-contain px-1.5 py-2 custom-scrollbar"
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <div className="border-l border-slate-300/40 pl-3 dark:border-slate-700/45">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkPreserveLineBreaks]}
            skipHtml={false}
            className={cn(
              'prose prose-sm max-w-none',
              'prose-slate dark:prose-invert',
              'text-[12.5px] leading-6 text-slate-500 dark:text-slate-300',
              'prose-p:my-1.5 prose-p:leading-6',
              'prose-code:text-slate-700 dark:prose-code:text-slate-200',
              'prose-code:bg-slate-200/38 dark:prose-code:bg-slate-800/52',
              'prose-code:px-1 prose-code:py-0.5 prose-code:rounded-sm prose-code:text-[10px]',
              'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-slate-700',
              'prose-strong:font-semibold prose-strong:text-slate-700 dark:prose-strong:text-slate-100'
            )}
          >
            {fixedContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export const ReasoningSegmentNext: React.FC<ReasoningSegmentNextProps> = memo(({
  segment,
  isStreaming = false
}) => {
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const [isOpen, setIsOpen] = React.useState(false)
  const [liveNow, setLiveNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (!isStreaming) {
      return
    }

    setLiveNow(Date.now())

    const timer = window.setInterval(() => {
      setLiveNow(Date.now())
    }, 250)

    return () => {
      window.clearInterval(timer)
    }
  }, [isStreaming])

  const durationMs = React.useMemo(() => {
    if (typeof segment.timestamp !== 'number') {
      return undefined
    }

    if (typeof segment.endedAt === 'number' && segment.endedAt >= segment.timestamp) {
      return segment.endedAt - segment.timestamp
    }

    if (isStreaming) {
      return Math.max(0, liveNow - segment.timestamp)
    }

    return undefined
  }, [isStreaming, liveNow, segment.endedAt, segment.timestamp])

  const thoughtSeconds = durationMs != null ? Math.max(1, Math.ceil(durationMs / 1000)) : undefined

  return (
    <div className="my-2 w-full">
      <div className="inline-block max-w-[760px]">
        <AssistantSegmentPopout
          open={isOpen}
          onOpenChange={setIsOpen}
          renderTrigger={({ isOpen }) => (
            <button
              type="button"
              aria-label="Inspect thought process"
              className={cn(
                'group inline-flex w-auto cursor-pointer items-center justify-start gap-0 rounded-xl px-0 py-0',
                'border-0 ring-0 outline-hidden',
                'text-left',
                'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:focus-visible:ring-slate-500/80'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl px-2 py-1',
                  'transition-colors duration-200 ease-out',
                  'group-hover:bg-slate-100/45 dark:group-hover:bg-white/4'
                )}
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-lg bg-slate-200/45 text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  <Lightbulb className={cn(
                    'w-3 h-3 dark:text-slate-500',
                    'transition-all duration-300 ease-out',
                    isOpen && 'scale-110 rotate-12'
                  )} />
                </span>
                <span
                  className={cn(
                    'select-none text-[10px] font-semibold tracking-tight tabular-nums uppercase',
                    'text-slate-600 dark:text-slate-300',
                    'transition-colors duration-200 ease-out'
                  )}
                >
                  Thought
                </span>
                <span className='text-slate-400/90 dark:text-slate-300 text-[10px]'>
                  { thoughtSeconds && ` · ${thoughtSeconds}s`}
                </span>
              </span>
            </button>
          )}
        >
          <ReasoningSegmentPanel
            content={segment.content}
            fixedContent={fixedContent}
          />
        </AssistantSegmentPopout>
      </div>
    </div>
  )
})
