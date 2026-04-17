import React, { Profiler, memo, useEffect } from 'react'
import { StreamingMarkdownSwitch } from '../../typewriter/StreamingMarkdownSwitch'
import {
  flushAssistantStreamingPerfSession,
  isAssistantStreamingPerfEnabled,
  recordAssistantStreamingCommit
} from '../../typewriter/assistantStreamingPerf'
import { TextSegment } from '../segments/TextSegment'

function getStreamingTextRenderMode(): 'markdown' | 'switch' {
  return (globalThis as any).__STREAMING_TEXT_RENDER_MODE ?? 'switch'
}

const ASSISTANT_TEXT_PROSE_CLASS_NAME =
  'prose px-2 text-sm text-blue-gray-600 dark:prose-invert prose-hr:mt-2 prose-hr:mb-1 prose-p:mb-2 prose-p:mt-2 prose-code:text-blue-400 dark:prose-code:text-blue-600 dark:text-slate-300 font-medium max-w-full prose-a:text-blue-600 dark:prose-a:text-sky-400 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-blue-400/60 dark:prose-a:decoration-sky-400/60 hover:prose-a:text-blue-700 dark:hover:prose-a:text-sky-300'

export interface AssistantTextSegmentContentProps {
  segment: TextSegment
  visibleText?: string
  isTyping: boolean
}

export const AssistantTextSegmentContent: React.FC<AssistantTextSegmentContentProps> = memo(({
  segment,
  visibleText,
  isTyping
}) => {
  const mode = getStreamingTextRenderMode()
  const hasCode = segment.content.includes('```') || segment.content.includes('`')
  const perfMode = hasCode ? 'code' : mode
  const perfSessionId = `assistant-text-segment:${segment.segmentId}:${perfMode}`

  useEffect(() => {
    if (!isAssistantStreamingPerfEnabled()) return

    return () => {
      flushAssistantStreamingPerfSession(perfSessionId, 'unmount')
    }
  }, [perfSessionId])

  let content: React.ReactNode
  if (hasCode) {
    content = <TextSegment segment={segment} visibleText={visibleText} animateOnChange={false} />
  } else if (mode === 'markdown') {
    content = (
      <TextSegment
        segment={segment}
        visibleText={visibleText}
        animateOnChange={isTyping}
        transitionKey={visibleText}
      />
    )
  } else {
    content = (
      <StreamingMarkdownSwitch
        text={segment.content}
        visibleText={visibleText}
        isTyping={isTyping}
        className={ASSISTANT_TEXT_PROSE_CLASS_NAME}
        perfSessionId={perfSessionId}
        perfSegmentId={segment.segmentId}
        perfMode={perfMode}
      />
    )
  }

  if (!isAssistantStreamingPerfEnabled()) {
    return content
  }

  return (
    <Profiler
      id={perfSessionId}
      onRender={(_id, phase, actualDuration, baseDuration) => {
        recordAssistantStreamingCommit({
          sessionId: perfSessionId,
          segmentId: segment.segmentId,
          mode: perfMode,
          phase,
          actualDuration,
          baseDuration
        })
      }}
    >
      {content}
    </Profiler>
  )
})
