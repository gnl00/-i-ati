import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@renderer/components/ui/accordion"
import { cn } from '@renderer/lib/utils'
import { ChevronDown, Lightbulb } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from '@renderer/components/theme-provider'
import { useChatStore } from '@renderer/store'
import { useCommandConfirmationStore } from '@renderer/store/commandConfirmation'
import { ToolCallResult } from './ToolCallResult'
import { useMessageTypewriter } from './use-message-typewriter'
import { markdownCodeComponents, fixMalformedCodeBlocks } from './markdown-components'
import { MessageOperations } from './message-operations'
import { ErrorMessage } from './error-message'
import { CommandConfirmation } from './CommandConfirmation'
import { useEnterTransition } from './use-enter-transition'
import { StreamingMarkdownSwitch } from './StreamingMarkdownSwitch'
import { remarkPreserveLineBreaks } from './markdown-plugins'

function getStreamingTextRenderMode(): 'markdown' | 'switch' {
  return (globalThis as any).__STREAMING_TEXT_RENDER_MODE ?? 'switch'
}

function getSegmentRenderKey(segment: MessageSegment, index: number): string {
  if (segment.type === 'toolCall' && segment.toolCallId) {
    return `tool-${segment.toolCallId}`
  }
  if (segment.type === 'error' && segment.error?.timestamp) {
    return `error-${segment.error.timestamp}`
  }
  const timestamp = (segment as { timestamp?: number }).timestamp
  if (timestamp) {
    return `${segment.type}-${timestamp}`
  }
  return `${segment.type}-${index}`
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
    : (entered ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-1 blur-xs")

  // Fix malformed code blocks before rendering
  const fixedText = fixMalformedCodeBlocks(displayedText)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkPreserveLineBreaks]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      skipHtml={false}
      remarkRehypeOptions={{ passThrough: ['link'] }}
      className={cn(
        "prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full",
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
 * Reasoning segment component (collapsible with Framer Motion).
 */
const ReasoningSegment: React.FC<{ segment: MessageSegment }> = memo(({ segment }) => {
  // Fix malformed code blocks in reasoning content
  const fixedContent = fixMalformedCodeBlocks(segment.content)
  const entered = useEnterTransition('enter')
  const [isOpen, setIsOpen] = React.useState(false)

  const toggleOpen = () => setIsOpen(!isOpen)

  return (
    <div className='w-fit my-2'>
      {/* Trigger Button */}
      <button
        onClick={toggleOpen}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-lg px-2 py-1',
          'border-0 ring-0 outline-hidden',
          'transition-all duration-300 ease-out',
          'hover:bg-slate-200/60 dark:hover:bg-slate-700/40',
          'focus:outline-hidden focus-visible:outline-hidden'
        )}
      >
        <Lightbulb className={cn(
          'w-3 h-3 text-slate-400 dark:text-slate-500',
          'transition-all duration-300 ease-out',
          'group-hover:text-slate-500 dark:group-hover:text-slate-300',
          isOpen && 'scale-110 rotate-12'
        )} />
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-tight',
          'text-slate-500 dark:text-slate-400',
          'transition-colors duration-300 ease-out',
          'group-hover:text-slate-700 dark:group-hover:text-slate-300'
        )}>
          Reasoning
        </span>
        <ChevronDown className={cn(
          'w-3 h-3 text-slate-400/80 dark:text-slate-500/70',
          'transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]',
          isOpen && 'rotate-180 scale-110'
        )} />
      </button>

      {/* Content with Framer Motion */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: "auto", opacity: 1, marginTop: 4 }}
            exit={{
              height: 0,
              opacity: 0,
              marginTop: 0,
              transition: { duration: 0.25, ease: "easeInOut" }
            }}
            transition={{
              duration: 0.3,
              ease: "circOut" // smooth easing without bounce
            }}
            className="overflow-hidden"
          >
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
                "prose prose-sm max-w-none",
                "prose-slate dark:prose-invert",
                // 统一设置文本颜色和大小
                "text-[13px] text-slate-500 dark:text-slate-400 italic",
                // 段落间距
                "prose-p:my-1.5 prose-p:leading-relaxed",
                // 代码块样式（覆盖斜体）
                "prose-code:text-slate-600 dark:prose-code:text-slate-400",
                "prose-code:bg-slate-200/50 dark:prose-code:bg-slate-800/50",
                "prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[10px] prose-code:not-italic",
                // 分隔线
                "prose-hr:border-slate-200 dark:prose-hr:border-slate-700 prose-hr:my-2",
                // 粗体（覆盖斜体）
                "prose-strong:text-slate-600 dark:prose-strong:text-slate-300 prose-strong:font-semibold prose-strong:not-italic",
                // 动画
                "transition-[opacity,transform] duration-400 ease-out",
                "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0",
                entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
              )}
            >
              {fixedContent}
            </ReactMarkdown>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
      <div>
        {/* Model Badge */}
        {m.model && (
          <div
            id='model-badge'
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 mb-1.5 rounded-lg',
              'select-none font-medium text-[11px] tracking-wide',
              'bg-slate-50/80 dark:bg-slate-800/60',
              'border border-slate-200/60 dark:border-slate-700/50',
              'shadow-xs',
              'transition-all duration-300 ease-out',
              'backdrop-blur-xs',
              showLoadingIndicator && isLatest && 'animate-shine-infinite'
            )}
          >
            {/* Icon indicator */}
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              'bg-slate-400 dark:bg-slate-500',
              'transition-all duration-300',
              showLoadingIndicator && isLatest && 'animate-model-badge-dot'
            )} />

            {/* Model name */}
            <span className="text-slate-600 dark:text-slate-400">
              {m.model}
            </span>
          </div>
        )}

        {/* Segments */}
        {segments.map((segment, segIdx) => {
          if (!shouldRenderSegment(segIdx)) return null

          const key = getSegmentRenderKey(segment, segIdx)

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
              "prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full"
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
