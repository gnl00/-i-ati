import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@renderer/shared/lib/utils'
import { markdownCodeComponents } from '../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../markdown/markdown-plugins'
import { MessageOperations } from '../message-operations'
import { useEnterTransition } from '../typewriter/use-enter-transition'
import { loadKatexStyles } from '@renderer/shared/lib/styleLoaders'
import { ChevronDown, ChevronUp, Send } from 'lucide-react'

export interface UserMessageProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  isPending?: boolean
  isHovered: boolean
  onHover: (idx: number) => void
  onCopyClick: (content: string) => void
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
  const [canCollapse, setCanCollapse] = useState(false)
  const [hasMeasured, setHasMeasured] = useState(false)
  const [measuredExpandedHeight, setMeasuredExpandedHeight] = useState<number | null>(null)
  const [measuredContentSignature, setMeasuredContentSignature] = useState(contentSignature)

  const measureContent = useCallback(() => {
    const node = contentRef.current
    if (!node) return

    const nextHeight = node.scrollHeight
    const nextCanCollapse = nextHeight > COLLAPSED_USER_MESSAGE_HEIGHT + COLLAPSE_OVERFLOW_BUFFER

    setMeasuredContentSignature(contentSignature)
    setMeasuredExpandedHeight(nextHeight)
    setCanCollapse(nextCanCollapse)
    setHasMeasured(true)
  }, [contentSignature])

  useLayoutEffect(() => {
    setHasMeasured(false)
    setMeasuredExpandedHeight(null)
  }, [contentSignature])

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return

    measureContent()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureContent)
      return () => window.removeEventListener('resize', measureContent)
    }

    const resizeObserver = new ResizeObserver(() => {
      measureContent()
    })
    resizeObserver.observe(node)
    return () => resizeObserver.disconnect()
  }, [contentSignature, measureContent])

  const hasCurrentMeasurement = hasMeasured && measuredContentSignature === contentSignature
  const maxHeight = isExpanded && hasCurrentMeasurement && measuredExpandedHeight !== null
    ? `${measuredExpandedHeight}px`
    : !isExpanded && (canCollapse || !hasCurrentMeasurement)
      ? `${COLLAPSED_USER_MESSAGE_HEIGHT}px`
      : undefined
  const showCollapseControls = hasCurrentMeasurement && canCollapse

  return (
    <div className="relative">
      <div className="relative">
        <div
          ref={contentRef}
          data-testid="user-message-collapsible-content"
          data-expanded={isExpanded ? 'true' : 'false'}
          className={cn(
            "overflow-hidden transition-[max-height,opacity,filter] duration-[280ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
            "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:filter-none",
            showCollapseControls && !isExpanded ? "opacity-[0.992] saturate-[0.98]" : "opacity-100 saturate-100"
          )}
          style={maxHeight ? { maxHeight } : undefined}
        >
          {children}
        </div>

        {showCollapseControls && (
          <>
            <div
              aria-hidden="true"
              data-testid={isExpanded ? undefined : 'user-message-collapse-fade'}
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-24",
                "bg-linear-to-b from-slate-100/0 via-slate-100/72 to-slate-100",
                "transition-opacity duration-260 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                isExpanded ? "opacity-0" : "opacity-100",
                "dark:from-gray-800/0 dark:via-gray-800/72 dark:to-gray-800"
              )}
            />
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-[72px]",
                "bg-slate-100/38 backdrop-blur-[3px]",
                "mask-[linear-gradient(to_bottom,transparent_0%,black_48%)]",
                "[-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_48%)]",
                "transition-opacity duration-260 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
                isExpanded ? "opacity-0" : "opacity-100",
                "dark:bg-gray-800/42"
              )}
            />
          </>
        )}
      </div>

      {showCollapseControls && (
        <div
          className={cn(
            "relative z-10 mt-2 flex justify-center",
            "transition-[opacity,transform,filter] duration-240 ease-[cubic-bezier(0.25,1,0.5,1)]",
            "motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:filter-none"
          )}
        >
          <button
            type="button"
            aria-expanded={isExpanded}
            data-testid={isExpanded ? 'user-message-collapse-button' : 'user-message-expand-button'}
            onClick={onToggleExpanded}
            className={cn(
              "inline-flex h-7 min-w-27 items-center justify-center gap-1 rounded-full px-2.5",
              "bg-white/25 text-xs font-medium text-slate-600",
              "shadow-[0_8px_24px_-16px_rgba(15,23,42,0.58)] backdrop-blur-md",
              "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out",
              "hover:scale-[1.015] hover:bg-white/35 hover:text-slate-800 hover:shadow-[0_10px_28px_-16px_rgba(15,23,42,0.72)]",
              "active:scale-[0.99]",
              "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500/30",
              "motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
              "dark:border-white/10 dark:bg-gray-950/58 dark:text-gray-300 dark:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.9)]",
              "dark:hover:border-white/16 dark:hover:bg-gray-950/78 dark:hover:text-white"
            )}
          >
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <ChevronDown
                className={cn(
                  "absolute h-3.5 w-3.5 transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.25,1,0.5,1)]",
                  "motion-reduce:transition-none motion-reduce:rotate-0 motion-reduce:scale-100 motion-reduce:filter-none",
                  isExpanded ? "opacity-0 rotate-90 scale-90 blur-[1px]" : "opacity-100 rotate-0 scale-100 blur-0"
              )}
              />
              <ChevronUp
                className={cn(
                  "absolute h-3.5 w-3.5 transition-[opacity,transform,filter] duration-220 ease-[cubic-bezier(0.25,1,0.5,1)]",
                  "motion-reduce:transition-none motion-reduce:rotate-0 motion-reduce:scale-100 motion-reduce:filter-none",
                  isExpanded ? "opacity-100 rotate-0 scale-100 blur-0" : "opacity-0 -rotate-90 scale-90 blur-[1px]"
                )}
              />
            </span>
            <span className="relative inline-grid min-w-[4.75rem] grid-cols-1 justify-items-center overflow-hidden">
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                  "motion-reduce:transition-none motion-reduce:scale-100 motion-reduce:filter-none",
                  isExpanded ? "opacity-0 scale-[0.98] blur-[1px]" : "opacity-100 scale-100 blur-0"
                )}
              >
                Show More
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 transition-[opacity,transform,filter] duration-[220ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                  "motion-reduce:transition-none motion-reduce:scale-100 motion-reduce:filter-none",
                  isExpanded ? "opacity-100 scale-100 blur-0" : "opacity-0 scale-[0.98] blur-[1px]"
                )}
              >
                Hide
              </span>
            </span>
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
              "prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-full dark:text-white prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300",
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

  const onCopy = () => {
    if (typeof m.content === 'string') {
      onCopyClick(m.content)
    } else {
      // VLM content: only copy text part
      const textContent = m.content
        .filter((item: VLMContent) => item.text)
        .map((item: VLMContent) => item.text)
        .join('\n')
      onCopyClick(textContent)
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
          "max-w-[85%] rounded-xl py-3 px-3 bg-slate-100 dark:bg-gray-800",
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
              className={cn("prose prose-code:text-gray-400 text-sm text-blue-gray-600 dark:text-gray-300 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300")}
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
