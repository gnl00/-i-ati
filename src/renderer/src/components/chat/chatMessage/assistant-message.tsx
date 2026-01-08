import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { Badge } from "@renderer/components/ui/badge"
import { cn } from '@renderer/lib/utils'
import { BrainCircuit } from 'lucide-react'
import { useTheme } from '@renderer/components/theme-provider'
import { useChatStore } from '@renderer/store'
import { ToolCallResult } from '../ToolCallResult'
import { useMessageTypewriter } from './use-message-typewriter'
import { markdownCodeComponents } from './markdown-components'
import { MessageOperations } from './message-operations'

export interface AssistantMessageProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onCopyClick: (content: string) => void
  onTypingChange?: () => void
}

/**
 * Text segment component with typewriter effect.
 */
const TextSegment: React.FC<{ segment: MessageSegment; visibleLength: number }> = memo(({ segment, visibleLength }) => {
  const displayedText = segment.content.slice(0, visibleLength)

  if (!displayedText) return null

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      skipHtml={false}
      remarkRehypeOptions={{ passThrough: ['link'] }}
      className="prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%] transition-all duration-400 ease-in-out"
      components={markdownCodeComponents}
    >
      {displayedText}
    </ReactMarkdown>
  )
})

/**
 * Reasoning segment component (collapsible accordion).
 */
const ReasoningSegment: React.FC<{ segment: MessageSegment }> = memo(({ segment }) => (
  <Accordion type="single" collapsible className='pl-0.5 pr-0.5 rounded-xl'>
    <AccordionItem value={`reasoning-${segment.content}`}>
      <AccordionTrigger className='py-2'>
        <div className='flex items-center gap-2'>
          <BrainCircuit className='w-4 h-4 text-gray-500 dark:text-gray-400' />
          <span className='text-xs text-gray-500 dark:text-gray-400 font-medium'>Reasoning</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className='prose px-2 py-1 text-xs text-gray-500 dark:text-gray-400 italic'>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            skipHtml={false}
            className="prose px-0.5 py-0.5 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300 transition-all duration-400 ease-in-out"
          >
            {segment.content}
          </ReactMarkdown>
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
))

/**
 * Assistant message component (left-aligned).
 * Supports segments: text (with typewriter), reasoning (collapsible), toolCall.
 */
export const AssistantMessage: React.FC<AssistantMessageProps> = memo(({
  index,
  message: m,
  isLatest,
  isHovered,
  onHover,
  onCopyClick,
  onTypingChange
}) => {
  const { theme } = useTheme()
  const showLoadingIndicator = useChatStore(state => state.showLoadingIndicator)

  const {
    segments,
    getSegmentVisibleLength,
    shouldRenderSegment
  } = useMessageTypewriter({
    index,
    message: m,
    isLatest,
    onTypingChange
  })

  const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (!m || m.role !== 'assistant') return null

  return (
    <div
      id='assistant-message'
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        "flex justify-start flex-col",
        index === 0 ? 'mt-2' : '',
        isLatest && "animate-assistant-message-in"
      )}
    >
      <div className="overflow-y-scroll">
        {/* Model Badge */}
        {m.model && (
          <Badge
            id='model-badge'
            variant="outline"
            className={cn(
              'select-none text-gray-700 dark:text-gray-300 mb-1 dark:border-white/20',
              showLoadingIndicator && isLatest ? 'animate-shine-infinite' : ''
            )}
          >
            @{m.model}
          </Badge>
        )}

        {/* Segments */}
        {segments.map((segment, segIdx) => {
          if (!shouldRenderSegment(segIdx)) return null

          if (segment.type === 'text') {
            return <TextSegment key={`text-${segIdx}`} segment={segment} visibleLength={getSegmentVisibleLength(segIdx)} />
          } else if (segment.type === 'reasoning') {
            return <ReasoningSegment key={`reasoning-${segIdx}`} segment={segment} />
          } else if (segment.type === 'toolCall') {
            return <ToolCallResult key={`tool-${segIdx}`} toolCall={segment} index={index} isDarkMode={isDarkMode} />
          }
          return null
        })}
      </div>

      {/* Operations */}
      <MessageOperations
        type="assistant"
        isHovered={isHovered}
        showRegenerate={isLatest}
        onCopyClick={() => onCopyClick(m.content as string)}
        onRegenerateClick={() => {
          // TODO: 实现重新生成功能
          console.log('Regenerate message:', index)
        }}
        onEditClick={() => {
          // TODO: 实现编辑助手消息功能
          console.log('Edit assistant message:', index)
        }}
      />
    </div>
  )
})
