import React, { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { cn } from '@renderer/lib/utils'
import { useEnterTransition } from '../../typewriter/use-enter-transition'
import { markdownCodeComponents, fixMalformedCodeBlocks } from '../../markdown/markdown-components'
import { remarkPreserveLineBreaks } from '../../markdown/markdown-plugins'

interface TextSegmentProps {
  segment: TextSegment
  visibleText?: string
  animateOnChange?: boolean
  transitionKey?: string
}

export const TextSegment: React.FC<TextSegmentProps> = memo(({
  segment,
  visibleText,
  animateOnChange,
  transitionKey
}) => {
  const displayedText = visibleText ?? segment.content

  const entered = useEnterTransition(
    animateOnChange ? (transitionKey ?? displayedText) : 'enter',
    { enabled: Boolean(displayedText), throttleMs: animateOnChange ? 120 : 0 }
  )

  if (!displayedText) return null

  const transitionStateClass = animateOnChange
    ? (entered ? 'opacity-100 translate-y-0 blur-0' : 'opacity-100 translate-y-[2px] blur-[2px]')
    : (entered ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-1 blur-xs')

  const fixedText = fixMalformedCodeBlocks(displayedText)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkPreserveLineBreaks]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      skipHtml={false}
      remarkRehypeOptions={{ passThrough: ['link'] }}
      className={cn(
        'prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full',
        'prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300',
        'transform-gpu transition-[opacity,transform,filter] duration-250 ease-out',
        'motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:blur-0',
        transitionStateClass
      )}
      components={markdownCodeComponents}
    >
      {fixedText}
    </ReactMarkdown>
  )
})
