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
import { useCommandConfirmationStore } from '@renderer/store/commandConfirmation'
import { ToolCallResult } from '../ToolCallResult'
import { useMessageTypewriter } from './use-message-typewriter'
import { markdownCodeComponents, fixMalformedCodeBlocks } from './markdown-components'
import { MessageOperations } from './message-operations'
import { ErrorMessage } from './error-message'
import { CommandConfirmation } from './CommandConfirmation'
import { useEnterTransition } from './use-enter-transition'
import { StreamingMarkdownSwitch } from './StreamingMarkdownSwitch'

function getStreamingTextRenderMode(): 'markdown' | 'switch' {
  return (globalThis as any).__STREAMING_TEXT_RENDER_MODE ?? 'switch'
}

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
const TextSegment: React.FC<{
  segment: MessageSegment
  visibleText?: string
  animateOnChange?: boolean
  transitionKey?: string
}> = memo(({ segment, visibleText, animateOnChange, transitionKey }) => {
  const displayedText = visibleText ?? segment.content

  const entered = useEnterTransition(
    animateOnChange ? (transitionKey ?? displayedText) : 'enter',
    { enabled: Boolean(displayedText), throttleMs: animateOnChange ? 120 : 0 }
  )

  if (!displayedText) return null

  const transitionStateClass = animateOnChange
    ? (entered ? "opacity-100 translate-y-0 blur-0" : "opacity-100 translate-y-[2px] blur-[2px]")
    : (entered ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-1 blur-sm")

  // Fix malformed code blocks before rendering
  const fixedText = fixMalformedCodeBlocks(displayedText)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      skipHtml={false}
      remarkRehypeOptions={{ passThrough: ['link'] }}
      className={cn(
        "prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%]",
        "transform-gpu transition-[opacity,transform,filter] duration-250 ease-out will-change-[opacity,transform,filter]",
        "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0",
        transitionStateClass
      )}
      components={markdownCodeComponents}
    >
      {fixedText}
    </ReactMarkdown>
  )
})

/**
 * Reasoning segment component (collapsible accordion).
 */
const ReasoningSegment: React.FC<{ segment: MessageSegment }> = memo(({ segment }) => {
  // Fix malformed code blocks in reasoning content
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const entered = useEnterTransition('enter')

  return (
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
              className={cn(
                "prose px-0.5 py-0.5 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-4 prose-hr:mb-4 prose-code:text-gray-400 dark:prose-code:text-gray-100 dark:text-slate-300",
                "transition-[opacity,transform,filter] duration-300 ease-out will-change-[opacity,transform,filter]",
                "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0",
                entered ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-1 blur-sm"
              )}
            >
              {fixedContent}
            </ReactMarkdown>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
})

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

  // 命令确认状态
  const pendingRequest = useCommandConfirmationStore(state => state.pendingRequest)
  const confirm = useCommandConfirmationStore(state => state.confirm)
  const cancel = useCommandConfirmationStore(state => state.cancel)

  const {
    segments,
    getSegmentVisibleLength,
    getVisibleTokens,
    shouldRenderSegment,
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

          // 生成唯一的 key
          let key: string
          if (segment.type === 'toolCall' && segment.toolCallId && segment.toolCallIndex !== undefined) {
            // 对于 toolCall segment，使用 toolCallId-index 作为唯一 key
            key = `tool-${segment.toolCallId}-${segment.toolCallIndex}`
          } else {
            // 对于其他 segment，使用 type-segIdx
            key = `${segment.type}-${segIdx}`
          }

          if (segment.type === 'text') {
            const visibleTokenCount = getSegmentVisibleLength(segIdx)
            const isTyping = visibleTokenCount !== Infinity
            const visibleTokens = isTyping ? getVisibleTokens(segIdx) : undefined
            const hasCode = segment.content.includes('```') || segment.content.includes('`')

            if (hasCode) {
              const visibleText = visibleTokens ? visibleTokens.join('') : undefined
              return <TextSegment key={key} segment={segment} visibleText={visibleText} animateOnChange={false} />
            }

            const mode = getStreamingTextRenderMode()
            if (mode === 'markdown') {
              const visibleText = visibleTokens ? visibleTokens.join('') : undefined
              return (
                <TextSegment
                  key={key}
                  segment={segment}
                  visibleText={visibleText}
                  animateOnChange={isTyping}
                  transitionKey={visibleText}
                />
              )
            }

            const proseClassName =
              "prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-[100%]"
            return (
              <StreamingMarkdownSwitch
                key={key}
                text={segment.content}
                visibleTokens={visibleTokens}
                isTyping={isTyping}
                className={proseClassName}
              />
            )
          } else if (segment.type === 'reasoning') {
            return <ReasoningSegment key={key} segment={segment} />
          } else if (segment.type === 'toolCall') {
            return <ToolCallResult key={key} toolCall={segment} index={index} isDarkMode={isDarkMode} />
          } else if (segment.type === 'error') {
            return <ErrorMessage key={key} error={segment.error} />
          }
          return null
        })}

        {/* Command Confirmation */}
        {isLatest && pendingRequest && (
          <CommandConfirmation
            request={pendingRequest}
            onConfirm={confirm}
            onCancel={cancel}
          />
        )}
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
