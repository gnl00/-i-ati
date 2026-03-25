import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@renderer/lib/utils'
import { markdownCodeComponents } from '../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../markdown/markdown-plugins'
import { MessageOperations } from '../message-operations'
import { useEnterTransition } from '../typewriter/use-enter-transition'
import { loadKatexStyles } from '@renderer/utils/styleLoaders'
import { Send } from 'lucide-react'

export interface UserMessageProps {
  index: number
  message: ChatMessage
  isLatest: boolean
  isHovered: boolean
  onHover: (idx: number) => void
  onCopyClick: (content: string) => void
}

/**
 * VLM Content renderer for messages with images and text.
 */
const AnimatedMarkdown: React.FC<{
  markdown: string
  className?: string
}> = ({ markdown, className }) => {
  const entered = useEnterTransition('enter')
  React.useEffect(() => {
    void loadKatexStyles()
  }, [])
  React.useEffect(() => {
    const debug = (globalThis as any).__DEBUG_MARKDOWN_LINEBREAKS
    if (!debug) return
    const escaped = markdown.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
    console.log('[UserMarkdown] raw:', markdown)
    console.log('[UserMarkdown] escaped:', escaped)
  }, [markdown])

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

const VLMContentRenderer: React.FC<{ content: VLMContent[] }> = ({ content }) => (
  <div className="">
    {content.map((vlmContent: VLMContent, idx) => {
      if (vlmContent.image_url) {
        return <img key={idx} src={vlmContent.image_url?.url} onDoubleClick={e => e}></img>
      } else {
        return (
          <AnimatedMarkdown
            key={idx}
            markdown={vlmContent.text ?? ''}
            className="prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-full dark:text-white prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300"
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
  isHovered,
  onHover,
  onCopyClick
}) => {
  const telegramAttachmentCount = m.host?.attachments?.length ?? 0

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
          isLatest && "animate-shine animate-message-in"
        )}
      >
        {typeof m.content !== 'string' ? (
          <VLMContentRenderer content={m.content} />
        ) : (
          <AnimatedMarkdown
            markdown={m.content}
            className={cn("prose prose-code:text-gray-400 text-sm text-blue-gray-600 dark:text-gray-300 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300")}
          />
        )}
      </div>

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
    </div>
  )
})
