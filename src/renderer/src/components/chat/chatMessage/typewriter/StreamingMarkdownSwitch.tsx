import { memo, useEffect, useMemo } from 'react'
import { cn } from '@renderer/lib/utils'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { fixMalformedCodeBlocks, markdownCodeComponents } from '../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../markdown/markdown-plugins'
import { StreamingMarkdownLite } from '../typewriter/StreamingMarkdownLite'
import { loadKatexStyles } from '@renderer/utils/styleLoaders'

export const StreamingMarkdownSwitch: React.FC<{
  text: string
  visibleText?: string
  isTyping: boolean
  className?: string
}> = memo(({ text, visibleText, isTyping, className }) => {
  useEffect(() => {
    void loadKatexStyles()
  }, [])

  const fixedFullText = useMemo(() => fixMalformedCodeBlocks(text), [text])

  const fixedVisibleText = useMemo(() => {
    if (visibleText === undefined) return fixedFullText
    return fixMalformedCodeBlocks(visibleText)
  }, [visibleText, fixedFullText])

  const proseBoxClassName = cn("flow-root", className)

  if (!isTyping || visibleText === undefined) {
    return (
      <div className={proseBoxClassName}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkPreserveLineBreaks]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          skipHtml={false}
          remarkRehypeOptions={{ passThrough: ['link'] }}
          className="m-0!"
          components={markdownCodeComponents}
        >
          {fixedFullText}
        </ReactMarkdown>
      </div>
    )
  }

  return (
    <StreamingMarkdownLite
      text={fixedVisibleText}
      className={proseBoxClassName}
      animate
    />
  )
})
