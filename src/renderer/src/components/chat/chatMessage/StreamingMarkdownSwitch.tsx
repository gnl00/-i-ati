import { memo, useMemo } from 'react'
import { cn } from '@renderer/lib/utils'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { fixMalformedCodeBlocks, markdownCodeComponents } from './markdown-components'
import { remarkPreserveLineBreaks } from './markdown-plugins'
import { StreamingMarkdownLite } from './StreamingMarkdownLite'

export const StreamingMarkdownSwitch: React.FC<{
  text: string
  visibleTokens?: string[]
  isTyping: boolean
  className?: string
}> = memo(({ text, visibleTokens, isTyping, className }) => {
  const fixedFullText = useMemo(() => fixMalformedCodeBlocks(text), [text])

  const visibleText = useMemo(() => {
    if (!visibleTokens) return fixedFullText
    return fixMalformedCodeBlocks(visibleTokens.join(''))
  }, [visibleTokens, fixedFullText])

  const proseBoxClassName = cn("flow-root", className)

  if (!isTyping || !visibleTokens) {
    return (
      <div className={proseBoxClassName}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkPreserveLineBreaks]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          skipHtml={false}
          remarkRehypeOptions={{ passThrough: ['link'] }}
          className="!m-0"
          components={markdownCodeComponents}
        >
          {fixedFullText}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <StreamingMarkdownLite
      text={visibleText}
      className={proseBoxClassName}
      animate
    />
  )
})
