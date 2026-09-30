import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@renderer/shared/lib/utils'
import { markdownCodeComponents } from '../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../markdown/markdown-plugins'
import { MessageOperations, type CopyActionResult } from '../message-operations'
import { useEnterTransition } from '../typewriter/use-enter-transition'
import { loadKatexStyles } from '@renderer/shared/lib/styleLoaders'
import { useMessageScroller } from '@renderer/shared/components/ui/message-scroller'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'

export interface UserMessageProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  isPending?: boolean
  isHovered: boolean
  onHover: (idx: number) => void
  onCopyClick: (content: string) => CopyActionResult | Promise<CopyActionResult>
}

const COLLAPSED_USER_MESSAGE_HEIGHT = 140
const COLLAPSE_OVERFLOW_BUFFER = 24

const getContentSignature = (content: ChatMessage['content']): string => {
  if (typeof content === 'string') {
    return content
  }

  return content
    .map((item) => `${item.type ?? 'unknown'}:${item.text ?? ''}:${item.image_url?.url ?? ''}`)
    .join('\n')
}

const CollapsibleUserMessageContent: React.FC<{
  children: React.ReactNode
  contentSignature: string
  isExpanded: boolean
  onToggleExpanded: () => void
}> = ({ children, contentSignature, isExpanded, onToggleExpanded }) => {
  const contentRef = useRef<HTMLDivElement>(null)
  const contentId = useId()
  const { scrollToMessage } = useMessageScroller()
  const collapseScrollTargetRef = useRef<string | null>(null)
  const [canCollapse, setCanCollapse] = useState(false)
  const [hasMeasured, setHasMeasured] = useState(false)
  const [measuredContentSignature, setMeasuredContentSignature] = useState(contentSignature)
  const measurementFrameRef = useRef<number | null>(null)

  const measureContent = useCallback(() => {
    const node = contentRef.current
    if (!node) return

    const nextHeight = node.scrollHeight
    const nextCanCollapse = nextHeight > COLLAPSED_USER_MESSAGE_HEIGHT + COLLAPSE_OVERFLOW_BUFFER

    setMeasuredContentSignature(current => current === contentSignature ? current : contentSignature)
    setCanCollapse(current => current === nextCanCollapse ? current : nextCanCollapse)
    setHasMeasured(current => current ? current : true)
  }, [contentSignature])

  useLayoutEffect(() => {
    setHasMeasured(false)
  }, [contentSignature])

  useEffect(() => {
    const node = contentRef.current
    if (!node) return

    let active = true
    const scheduleMeasurement = () => {
      if (!active || measurementFrameRef.current !== null) return

      measurementFrameRef.current = window.requestAnimationFrame(() => {
        measurementFrameRef.current = null
        if (!active) return
        measureContent()
      })
    }

    scheduleMeasurement()

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleMeasurement)
    } else {
      resizeObserver = new ResizeObserver(scheduleMeasurement)
      resizeObserver.observe(node)
    }

    return () => {
      active = false
      if (measurementFrameRef.current !== null) {
        window.cancelAnimationFrame(measurementFrameRef.current)
        measurementFrameRef.current = null
      }
      window.removeEventListener('resize', scheduleMeasurement)
      resizeObserver?.disconnect()
    }
  }, [contentSignature, measureContent])

  useLayoutEffect(() => {
    const messageId = collapseScrollTargetRef.current
    collapseScrollTargetRef.current = null
    if (!isExpanded && messageId) {
      scrollToMessage(messageId, { align: 'start', behavior: 'instant' })
    }
  }, [isExpanded, scrollToMessage])

  const handleToggleExpanded = (): void => {
    if (isExpanded) {
      const item = contentRef.current?.closest<HTMLElement>('[data-slot="message-scroller-item"]')
      const viewport = item?.closest<HTMLElement>('[data-slot="message-scroller-viewport"]')
      if (item && viewport) {
        const scrollMargin = parseFloat(window.getComputedStyle(item).scrollMarginBlockStart) || 0
        if (item.getBoundingClientRect().top < viewport.getBoundingClientRect().top + scrollMargin) {
          collapseScrollTargetRef.current = item.dataset.messageId ?? null
        }
      }
    }
    onToggleExpanded()
  }

  const hasCurrentMeasurement = hasMeasured && measuredContentSignature === contentSignature
  const maxHeight = !isExpanded && (canCollapse || !hasCurrentMeasurement)
    ? `${COLLAPSED_USER_MESSAGE_HEIGHT}px`
    : undefined
  const showCollapseControls = hasCurrentMeasurement && canCollapse

  return (
    <div className="relative">
      <div className="relative">
        <div
          ref={contentRef}
          id={contentId}
          data-testid="user-message-collapsible-content"
          data-expanded={isExpanded ? 'true' : 'false'}
          className="overflow-hidden"
          style={maxHeight ? { maxHeight } : undefined}
        >
          {children}
        </div>

        {showCollapseControls && !isExpanded && (
          <div
            aria-hidden="true"
            data-testid="user-message-collapse-fade"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 chat-user-message-collapse-fade bg-linear-to-b from-slate-100/0 to-slate-100"
          />
        )}
      </div>

      {showCollapseControls && (
        <div className="mt-1 flex justify-start">
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={contentId}
            data-testid={isExpanded ? 'user-message-collapse-button' : 'user-message-expand-button'}
            onClick={handleToggleExpanded}
            className={cn(
              'inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium',
              'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700 active:scale-[0.98]',
              'transition-[background-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--chat-accent)/40',
              'dark:text-(--chat-text-secondary) dark:hover:bg-(--chat-surface-hover) dark:hover:text-(--chat-text-primary)'
            )}
          >
            {isExpanded
              ? <ChevronUp aria-hidden="true" className="h-3 w-3" />
              : <ChevronDown aria-hidden="true" className="h-3 w-3" />}
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * VLM Content renderer for messages with images and text.
 */
const AnimatedMarkdown: React.FC<{
  markdown: string
  className?: string
  animateOnEnter?: boolean
}> = ({ markdown, className, animateOnEnter = true }) => {
  const entered = useEnterTransition('enter', { enabled: animateOnEnter })
  React.useEffect(() => {
    void loadKatexStyles()
  }, [])

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkPreserveLineBreaks]}
      rehypePlugins={[rehypeKatex]}
      skipHtml={false}
      className={cn(
        className,
        "transition-[opacity,transform,filter] duration-300 ease-out",
        "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0",
        entered ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-1 blur-xs"
      )}
      components={markdownCodeComponents}
    >
      {markdown}
    </ReactMarkdown>
  )
}

const VLMContentRenderer: React.FC<{
  content: VLMContent[]
  animateOnEnter?: boolean
  markdownClassName?: string
  imageClassName?: string
}> = ({ content, animateOnEnter = true, markdownClassName, imageClassName }) => (
  <div className="">
    {content.map((vlmContent: VLMContent, idx) => {
      if (vlmContent.image_url) {
        return (
          <img
            key={idx}
            src={vlmContent.image_url?.url}
            onDoubleClick={e => e}
            className={cn("max-w-full rounded-lg", imageClassName)}
          ></img>
        )
      } else {
        return (
          <AnimatedMarkdown
            key={idx}
            markdown={vlmContent.text ?? ''}
            animateOnEnter={animateOnEnter}
            className={cn(
              "chat-user-message-prose prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-(--chat-accent-strong) prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-(--chat-accent)/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-(--chat-text-primary)",
              markdownClassName
            )}
          />
        )
      }
    })}
  </div>
)

/**
 * User message component (right-aligned).
 * Supports both plain text and VLM content (text + images).
 */
export const UserMessage: React.FC<UserMessageProps> = memo(({
  index,
  message: m,
  isLatest,
  isPending = false,
  isHovered,
  onHover,
  onCopyClick
}) => {
  const telegramAttachmentCount = m.host?.attachments?.length ?? 0
  const contentSignature = useMemo(() => getContentSignature(m.content), [m.content])
  const [isExpanded, setIsExpanded] = useState(false)

  useLayoutEffect(() => {
    setIsExpanded(false)
  }, [contentSignature])

  const onCopy = (): CopyActionResult | Promise<CopyActionResult> => {
    if (typeof m.content === 'string') {
      return onCopyClick(m.content)
    } else {
      // VLM content: only copy text part
      const textContent = m.content
        .filter((item: VLMContent) => item.text)
        .map((item: VLMContent) => item.text)
        .join('\n')
      return onCopyClick(textContent)
    }
  }

  if (!m.content) return null
  const shouldAnimateMarkdownEnter = isLatest || isPending

  return (
    <div
      id='usr-message'
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(-1)}
      className={cn("flex flex-col items-end mr-1", index === 0 ? 'mt-2' : '')}
    >
      {m.source === 'telegram' && (
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-sky-50/90 px-2.5 py-1 text-[11px] font-medium leading-none text-sky-700 shadow-xs shadow-black/5 dark:bg-sky-950/40 dark:text-sky-300">
          <span className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-sky-100/90 text-sky-600 dark:bg-sky-900/70 dark:text-sky-300">
            <Send className="h-2.5 w-2.5" />
          </span>
          <span>
            Telegram
            {m.host?.username ? ` · @${m.host.username}` : m.host?.displayName ? ` · ${m.host.displayName}` : ''}
            {telegramAttachmentCount > 0 ? ` · ${telegramAttachmentCount} attachment${telegramAttachmentCount > 1 ? 's' : ''}` : ''}
          </span>
        </div>
      )}

      <div
        id="usr-msg-content"
        className={cn(
          "chat-user-message-surface max-w-[85%] rounded-xl py-3 px-3 bg-slate-100",
          isLatest && "animate-shine animate-message-in",
          isPending && "opacity-75 saturate-90 shadow-sm shadow-slate-900/5 transition-[opacity,filter,box-shadow] duration-200 ease-out dark:shadow-black/20"
        )}
      >
        <CollapsibleUserMessageContent
          contentSignature={contentSignature}
          isExpanded={isExpanded}
          onToggleExpanded={() => setIsExpanded(current => !current)}
        >
          {typeof m.content !== 'string' ? (
            <VLMContentRenderer
              content={m.content}
              animateOnEnter={shouldAnimateMarkdownEnter}
            />
          ) : (
            <AnimatedMarkdown
              markdown={m.content}
              animateOnEnter={shouldAnimateMarkdownEnter}
              className={cn("chat-user-message-prose prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-(--chat-accent-strong) prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-(--chat-accent)/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-(--chat-text-primary)")}
            />
          )}
        </CollapsibleUserMessageContent>
      </div>

      {!isPending && (
        <MessageOperations
          type="user"
          message={m}
          isHovered={isHovered}
          onCopyClick={onCopy}
          onEditClick={() => {
            // TODO: 实现编辑用户消息功能
            console.log('Edit user message:', index)
          }}
        />
      )}
    </div>
  )
})
