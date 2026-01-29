import { memo, useMemo, type JSX } from 'react';
import { cn } from '@renderer/lib/utils'
import { FluidTypewriterText } from './FluidTypewriterText'

type Block =
  | { type: 'heading'; level: number; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] }

const renderInlineCode = (
  text: string,
  {
    animate,
    animationWindow
  }: { animate: boolean; animationWindow: number }
): React.ReactNode[] => {
  const parts = text.split('`')
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return <code key={`code-${index}`} className="rounded bg-black/5 dark:bg-white/10 px-1">{part}</code>
    }
    if (animate) {
      return (
        <FluidTypewriterText
          key={`text-${index}`}
          content={part}
          animationWindow={animationWindow}
        />
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}

const parseBlocks = (text: string): Block[] => {
  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0

  const pushParagraph = (content: string) => {
    if (!content.trim()) return
    blocks.push({ type: 'paragraph', content })
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim()
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1
      }
      blocks.push({ type: 'code', language, content: codeLines.join('\n') })
      continue
    }

    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (match) {
        blocks.push({ type: 'heading', level: match[1].length, content: match[2] })
        i += 1
        continue
      }
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      blocks.push({ type: 'quote', lines: quoteLines })
      continue
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch)
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i].trim()
        const orderedLine = current.match(/^(\d+)\.\s+(.*)$/)
        const unorderedLine = current.match(/^[-*+]\s+(.*)$/)
        if (ordered && orderedLine) {
          items.push(orderedLine[2])
          i += 1
          continue
        }
        if (!ordered && unorderedLine) {
          items.push(unorderedLine[1])
          i += 1
          continue
        }
        break
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    const paragraphLines: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i]
      const nextTrimmed = next.trim()
      if (!nextTrimmed) {
        i += 1
        break
      }
      if (
        nextTrimmed.startsWith('```') ||
        nextTrimmed.startsWith('#') ||
        nextTrimmed.startsWith('>') ||
        /^(\d+)\.\s+/.test(nextTrimmed) ||
        /^[-*+]\s+/.test(nextTrimmed)
      ) {
        break
      }
      paragraphLines.push(next)
      i += 1
    }
    pushParagraph(paragraphLines.join('\n'))
  }

  return blocks
}

export const StreamingMarkdownLite: React.FC<{
  text: string
  className?: string
  animate?: boolean
  animationWindow?: number
}> = memo(({ text, className, animate = true, animationWindow = 12 }) => {
  const blocks = useMemo(() => parseBlocks(text), [text])
  const proseBoxClassName = cn("flow-root", className)

  return (
    <div className={proseBoxClassName} data-mode="lite">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = `h${block.level}` as keyof JSX.IntrinsicElements
          return (
            <Tag key={`heading-${index}`} className="mt-3 mb-2">
              {renderInlineCode(block.content, { animate, animationWindow })}
            </Tag>
          )
        }
        if (block.type === 'code') {
          return (
            <pre key={`code-${index}`} className="not-prose rounded-md bg-black/5 dark:bg-white/5 p-3 overflow-x-auto">
              <code className="font-mono text-xs">
                {block.content}
              </code>
            </pre>
          )
        }
        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag key={`list-${index}`} className="pl-5 my-2">
              {block.items.map((item, itemIdx) => (
                <li key={`item-${index}-${itemIdx}`} className="mb-1">
                  {renderInlineCode(item, { animate, animationWindow })}
                </li>
              ))}
            </ListTag>
          )
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={`quote-${index}`} className="border-l-2 border-gray-300/60 dark:border-gray-600/60 pl-3 my-2 text-gray-500 dark:text-gray-400">
              {block.lines.map((line, lineIdx) => (
                <p key={`quote-line-${index}-${lineIdx}`} className="mb-1 last:mb-0">
                  {renderInlineCode(line, { animate, animationWindow })}
                </p>
              ))}
            </blockquote>
          )
        }
        return (
          <p key={`paragraph-${index}`} className="mb-2 whitespace-pre-wrap">
            {renderInlineCode(block.content, { animate, animationWindow })}
          </p>
        )
      })}
    </div>
  )
})
