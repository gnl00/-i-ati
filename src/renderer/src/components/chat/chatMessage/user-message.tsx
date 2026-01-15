import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@renderer/lib/utils'
import { markdownCodeComponents } from './markdown-components'
import { MessageOperations } from './message-operations'
import { useEnterTransition } from './use-enter-transition'

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

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
      rehypePlugins={[rehypeKatex]}
      skipHtml={false}
      className={cn(
        className,
        "transition-[opacity,transform,filter] duration-300 ease-out will-change-[opacity,transform,filter]",
        "motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0",
        entered ? "opacity-100 translate-y-0 blur-0" : "opacity-0 translate-y-1 blur-sm"
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
            className="prose prose-code:text-gray-400 text-sm text-blue-gray-600 font-medium max-w-[100%] dark:text-white"
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
            className={cn("prose prose-code:text-gray-400 text-sm text-blue-gray-600 dark:text-gray-300 font-medium max-w-[100%]")}
          />
        )}
      </div>

      <MessageOperations
        type="user"
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
