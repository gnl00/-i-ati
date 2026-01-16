import { memo, useMemo } from 'react'
import { cn } from '@renderer/lib/utils'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { FluidTypewriterText } from './FluidTypewriterText'
import { fixMalformedCodeBlocks, markdownCodeComponents } from './markdown-components'

type TailKind = 'paragraph' | 'code'

function findLastSafeSplitIndex(markdown: string) {
  const lines = markdown.split('\n')
  let inCodeFence = false
  let offset = 0
  let lastSafe = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    const isFenceLine = trimmed.startsWith('```')
    if (isFenceLine) {
      if (!inCodeFence) {
        inCodeFence = true
      } else {
        inCodeFence = false
        lastSafe = offset + line.length + 1
      }
    }

    if (!inCodeFence) {
      const next = lines[i + 1]
      if (trimmed === '' && next !== undefined) {
        lastSafe = offset + line.length + 1
      }
    }

    offset += line.length + 1
  }

  return Math.min(lastSafe, markdown.length)
}

function getTailKind(tail: string): TailKind {
  const lines = tail.split('\n')
  let inCodeFence = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) inCodeFence = !inCodeFence
  }
  return inCodeFence ? 'code' : 'paragraph'
}

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
          remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          skipHtml={false}
          remarkRehypeOptions={{ passThrough: ['link'] }}
          className="!m-0 whitespace-pre-wrap"
          components={markdownCodeComponents}
        >
          {fixedFullText}
        </ReactMarkdown>
      </div>
    )
  }

  const stableEnd = findLastSafeSplitIndex(visibleText)
  const stableMarkdown = visibleText.slice(0, stableEnd)
  const tail = visibleText.slice(stableEnd)
  const tailKind = getTailKind(tail)

  // Preserve user-entered newlines while streaming to match final markdown rendering.
  const tailParagraphText = tail

  return (
    <div className={proseBoxClassName} data-mode="switch-solidify">
      {stableMarkdown.trim().length > 0 ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
          rehypePlugins={[rehypeRaw, rehypeKatex]}
          skipHtml={false}
          remarkRehypeOptions={{ passThrough: ['link'] }}
          className="!m-0 whitespace-pre-wrap"
          components={markdownCodeComponents}
        >
          {stableMarkdown}
        </ReactMarkdown>
      ) : null}

      {tail.trim().length > 0 ? (
        tailKind === 'code' ? (
          <pre className="not-prose whitespace-pre-wrap rounded-md bg-black/5 dark:bg-white/5 p-3 overflow-x-auto">
            <code className="font-mono text-xs">
              <FluidTypewriterText content={tail} animationWindow={10} />
            </code>
          </pre>
        ) : (
          <p className="whitespace-pre-wrap">
            <FluidTypewriterText content={tailParagraphText} animationWindow={10} />
          </p>
        )
      ) : null}
    </div>
  )
})
