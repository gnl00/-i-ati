import { memo, useEffect, useMemo, useRef, type JSX } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  recordAssistantStreamingLiteParse,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'
import { FluidTypewriterTextV2 } from './FluidTypewriterTextV2'
import {
  buildMarkdownBlockParseSnapshot,
  type MarkdownBlockParseSnapshot
} from './streamingMarkdownBlockParser'

const renderInlineCode = (
  text: string,
  {
    animate,
    animationWindow,
    perfSessionId,
    perfSegmentId,
    perfMode
  }: {
    animate: boolean
    animationWindow: number
    perfSessionId?: string
    perfSegmentId?: string
    perfMode?: AssistantStreamingPerfMode
  }
): React.ReactNode[] => {
  const parts = text.split('`')
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return <code key={`code-${index}`} className="rounded bg-black/5 dark:bg-white/10 px-1">{part}</code>
    }
    if (animate) {
      return (
        <FluidTypewriterTextV2
          key={`text-${index}`}
          content={part}
          animationWindow={animationWindow}
          perfSessionId={perfSessionId}
          perfSegmentId={perfSegmentId}
          perfMode={perfMode}
        />
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}

export const StreamingMarkdownLite: React.FC<{
  text: string
  className?: string
  animate?: boolean
  animationWindow?: number
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}> = memo(({ text, className, animate = true, animationWindow = 16, perfSessionId, perfSegmentId, perfMode = 'lite' }) => {
  const parseCacheRef = useRef<MarkdownBlockParseSnapshot>()
  const parseResult = useMemo(() => {
    const t0 = performance.now()
    const snapshot = buildMarkdownBlockParseSnapshot(text, parseCacheRef.current)
    return {
      snapshot,
      durationMs: performance.now() - t0
    }
  }, [text])
  const blocks = parseResult.snapshot.blocks
  const proseBoxClassName = cn("flow-root", className)
  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${perfMode}`

  useEffect(() => {
    parseCacheRef.current = parseResult.snapshot
  }, [parseResult.snapshot])

  useEffect(() => {
    recordAssistantStreamingLiteParse({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: perfMode,
      visibleTextLength: text.length,
      blockCount: blocks.length,
      durationMs: parseResult.durationMs
    })
  }, [activeSegmentId, activeSessionId, blocks.length, parseResult.durationMs, perfMode, text.length])

  return (
    <div className={proseBoxClassName} data-mode="lite">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = `h${block.level}` as keyof JSX.IntrinsicElements
          return (
            <Tag key={`heading-${index}`} className="mt-3 mb-2">
              {renderInlineCode(block.content, {
                animate,
                animationWindow,
                perfSessionId: activeSessionId,
                perfSegmentId: activeSegmentId,
                perfMode
              })}
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
                  {renderInlineCode(item, {
                    animate,
                    animationWindow,
                    perfSessionId: activeSessionId,
                    perfSegmentId: activeSegmentId,
                    perfMode
                  })}
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
                  {renderInlineCode(line, {
                    animate,
                    animationWindow,
                    perfSessionId: activeSessionId,
                    perfSegmentId: activeSegmentId,
                    perfMode
                  })}
                </p>
              ))}
            </blockquote>
          )
        }
        return (
          <p key={`paragraph-${index}`} className="mb-2 whitespace-pre-wrap">
            {renderInlineCode(block.content, {
              animate,
              animationWindow,
              perfSessionId: activeSessionId,
              perfSegmentId: activeSegmentId,
              perfMode
            })}
          </p>
        )
      })}
    </div>
  )
})
