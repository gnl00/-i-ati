import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'
import { fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

interface ReasoningSegmentProps {
  segment: ReasoningSegment
}

export const ReasoningSegment: React.FC<ReasoningSegmentProps> = memo(({ segment }) => {
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const [openItem, setOpenItem] = React.useState<string>('')
  const isOpen = openItem === 'reasoning'

  return (
    <div className="w-full my-2">
      <Accordion type="single" collapsible value={openItem} onValueChange={setOpenItem}>
        <AccordionItem value="reasoning" className="border-0">
          <AccordionTrigger
            className={cn(
              'group inline-flex items-center justify-start gap-1.5 rounded-lg px-2 py-1',
              'border-0 ring-0 outline-hidden',
              'transition-all duration-300 ease-out',
              'focus:outline-hidden focus-visible:outline-hidden',
              'hover:no-underline',
              'py-0'
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
            <span className={cn(
              'text-[10px] font-semibold uppercase select-none',
              'text-slate-500 dark:text-slate-400',
              'transition-colors duration-300 ease-out',
              'group-hover:text-slate-700 dark:group-hover:text-slate-300'
            )}>
              Thinking
            </span>
            <ChevronDown className="w-3 h-3 transition-transform duration-300 text-zinc-500 dark:text-zinc-400" />
          </AccordionTrigger>
          <AccordionContent className="pt-0 pb-0">
            <div className={cn(
              'ml-3 pl-3 mt-1',
              'bg-transparent',
              'border-l-2 border-dashed',
              'border-slate-300/60 dark:border-slate-600/50',
              'relative',
              'transition-colors duration-300 ease-out'
            )}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkPreserveLineBreaks]}
                skipHtml={false}
                className={cn(
                  'prose prose-sm max-w-none',
                  'prose-slate dark:prose-invert',
                  'text-[13px] text-slate-500 dark:text-slate-400 italic',
                  'prose-p:my-1.5 prose-p:leading-relaxed',
                  'prose-code:text-slate-600 dark:prose-code:text-slate-400',
                  'prose-code:bg-slate-200/50 dark:prose-code:bg-slate-800/50',
                  'prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px] prose-code:not-italic',
                  'prose-hr:border-slate-200 dark:prose-hr:border-slate-700 prose-hr:my-2',
                  'prose-strong:text-slate-600 dark:prose-strong:text-slate-300 prose-strong:font-semibold prose-strong:not-italic'
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
