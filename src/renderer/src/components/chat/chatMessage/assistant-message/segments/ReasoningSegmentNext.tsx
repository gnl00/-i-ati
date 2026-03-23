import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

interface ReasoningSegmentNextProps {
  segment: ReasoningSegment
  nextSegmentTimestamp?: number
  isStreaming?: boolean
}

export const ReasoningSegmentNext: React.FC<ReasoningSegmentNextProps> = memo(({
  segment,
  nextSegmentTimestamp,
  isStreaming = false
}) => {
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const [openItem, setOpenItem] = React.useState<string>('')
  const isOpen = openItem === 'reasoning'
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

    if (typeof nextSegmentTimestamp === 'number' && nextSegmentTimestamp >= segment.timestamp) {
      return nextSegmentTimestamp - segment.timestamp
    }

    if (isStreaming) {
      return Math.max(0, liveNow - segment.timestamp)
    }

    return undefined
  }, [isStreaming, liveNow, nextSegmentTimestamp, segment.timestamp])

  const thoughtSeconds = durationMs != null ? Math.max(1, Math.ceil(durationMs / 1000)) : undefined

  return (
    <div className="my-2 w-full">
      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem}>
        <AccordionItem value="reasoning" className="border-0">
          <div className="inline-block max-w-[760px]">
            <AccordionTrigger
              className={cn(
                'group inline-flex w-auto items-center justify-start gap-0 rounded-xl px-0 py-0',
                'border-0 ring-0 outline-hidden',
                'text-left',
                'focus:outline-hidden focus-visible:outline-hidden',
                'hover:no-underline'
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
                    'select-none text-[10px] font-semibold tracking-tight tabular-nums',
                    'text-slate-600 dark:text-slate-300',
                    'transition-colors duration-200 ease-out'
                  )}
                >
                  Thought
                </span>
                <span className='text-slate-400/90 dark:text-slate-300 text-[10px]'>
                  { thoughtSeconds && ` · ${thoughtSeconds}s`}
                </span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-slate-400 transition-transform duration-200 ease-out dark:text-slate-500',
                    isOpen && 'rotate-180'
                  )}
                />
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-0 pt-0">
              <div className="mt-1 ml-3 border-l border-slate-300/40 pl-3 dark:border-slate-700/45">
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
                    'prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px]',
                    'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-slate-700',
                    'prose-strong:font-semibold prose-strong:text-slate-700 dark:prose-strong:text-slate-100'
                  )}
                >
                  {fixedContent}
                </ReactMarkdown>
              </div>
            </AccordionContent>
          </div>
        </AccordionItem>
      </Accordion>
    </div>
  )
})
