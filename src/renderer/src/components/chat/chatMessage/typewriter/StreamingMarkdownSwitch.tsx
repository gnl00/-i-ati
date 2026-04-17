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
import {
  recordAssistantStreamingSwitchRender,
  type AssistantStreamingPerfMode
} from './assistantStreamingPerf'

export const StreamingMarkdownSwitch: React.FC<{
  text: string
  visibleText?: string
  isTyping: boolean
  className?: string
  perfSessionId?: string
  perfSegmentId?: string
  perfMode?: AssistantStreamingPerfMode
}> = memo(({ text, visibleText, isTyping, className, perfSessionId, perfSegmentId, perfMode }) => {
  const renderStart = performance.now()

  useEffect(() => {
    void loadKatexStyles()
  }, [])

  const fixedFullText = useMemo(() => fixMalformedCodeBlocks(text), [text])

  const fixedVisibleText = useMemo(() => {
    if (visibleText === undefined) return fixedFullText
    return fixMalformedCodeBlocks(visibleText)
  }, [visibleText, fixedFullText])

  const proseBoxClassName = cn("flow-root", className)
  const durationMs = performance.now() - renderStart
  const activePerfMode = perfMode ?? 'switch'
  const activeSegmentId = perfSegmentId ?? 'unknown'
  const activeSessionId = perfSessionId ?? `assistant-text-segment:${activeSegmentId}:${activePerfMode}`

  useEffect(() => {
    recordAssistantStreamingSwitchRender({
      sessionId: activeSessionId,
      segmentId: activeSegmentId,
      mode: activePerfMode,
      renderer: !isTyping || visibleText === undefined ? 'full-markdown' : 'lite',
      isTyping,
      visibleTextLength: visibleText?.length ?? text.length,
      durationMs
    })
  }, [activePerfMode, activeSegmentId, activeSessionId, durationMs, isTyping, text.length, visibleText])

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
      perfSessionId={activeSessionId}
      perfSegmentId={activeSegmentId}
      perfMode={activePerfMode}
    />
  )
})
