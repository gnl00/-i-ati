import React, { memo } from 'react'
import { StreamingMarkdownSwitch } from '../../typewriter/StreamingMarkdownSwitch'
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
  const hasCode = segment.content.includes('```') || segment.content.includes('`')

  if (hasCode) {
    return <TextSegment segment={segment} visibleText={visibleText} animateOnChange={false} />
  }

  const mode = getStreamingTextRenderMode()
  if (mode === 'markdown') {
    return (
      <TextSegment
        segment={segment}
        visibleText={visibleText}
        animateOnChange={isTyping}
        transitionKey={visibleText}
      />
    )
  }

  return (
    <StreamingMarkdownSwitch
      text={segment.content}
      visibleText={visibleText}
      isTyping={isTyping}
      className={ASSISTANT_TEXT_PROSE_CLASS_NAME}
    />
  )
})
