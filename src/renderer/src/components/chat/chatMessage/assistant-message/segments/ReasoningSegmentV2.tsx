import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

interface ReasoningSegmentV2Props {
  segment: ReasoningSegment
  nextSegmentTimestamp?: number
  isStreaming?: boolean
}

function formatThoughtDuration(seconds: number): string {
  return `THOUGHT · ${seconds}s`
}

export const ReasoningSegmentV2: React.FC<ReasoningSegmentV2Props> = memo(({
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
    <div className="my-1.5 w-full">
      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem}>
        <AccordionItem value="reasoning" className="border-0">
          <AccordionTrigger
            className={cn(
              'group inline-flex items-center justify-start gap-1.5 rounded-md px-1.5 py-0.5',
              'border-0 ring-0 outline-hidden',
              'text-left transition-colors duration-200 ease-out',
              'focus:outline-hidden focus-visible:outline-hidden',
              'hover:bg-transparent hover:no-underline'
            )}
          >
            <span className="inline-flex">
              <Lightbulb className={cn(
                'w-3 h-3 text-slate-400 dark:text-slate-500',
                'transition-all duration-300 ease-out',
                'group-hover:text-slate-500 dark:group-hover:text-slate-300',
                isOpen && 'scale-110 rotate-12'
              )} />
            </span>
            <span
              className={cn(
                'select-none text-[10px] font-semibold tracking-tight tabular-nums',
                'text-slate-500 dark:text-slate-400',
                'group-hover:text-slate-700 dark:group-hover:text-slate-300',
                'transition-colors duration-200 ease-out'
              )}
            >
              {typeof thoughtSeconds === 'number' ? formatThoughtDuration(thoughtSeconds) : 'THOUGHT'}
            </span>
            <ChevronDown
              className={cn(
                'h-3 w-3 text-zinc-400 transition-transform duration-200 ease-out dark:text-zinc-500',
                isOpen && 'rotate-180'
              )}
            />
          </AccordionTrigger>
          <AccordionContent className="pb-0 pt-0">
            <div
              className={cn(
                'mt-1 ml-3 border-l border-slate-300/55 pl-3 dark:border-slate-700/60'
              )}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkPreserveLineBreaks]}
                skipHtml={false}
                className={cn(
                  'prose prose-sm max-w-none',
                  'prose-slate dark:prose-invert',
                  'text-[12.5px] leading-6 text-slate-500 dark:text-slate-400',
                  'prose-p:my-1.5 prose-p:leading-6',
                  'prose-code:text-slate-600 dark:prose-code:text-slate-300',
                  'prose-code:bg-slate-200/45 dark:prose-code:bg-slate-800/55',
                  'prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px]',
                  'prose-hr:my-2 prose-hr:border-slate-200 dark:prose-hr:border-slate-700',
                  'prose-strong:font-semibold prose-strong:text-slate-600 dark:prose-strong:text-slate-200'
                )}
              >
                {fixedContent}
              </ReactMarkdown>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
})
