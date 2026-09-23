import React, { memo } from 'react'
import { AssistantTextSegmentList } from './renderers/AssistantTextSegmentList'
import { AssistantCompletedWorkGroup } from './renderers/AssistantCompletedWorkGroup'
import { AssistantTextSegmentContent } from './renderers/AssistantTextSegmentContent'
import { AssistantSupportSegmentList } from './renderers/AssistantSupportSegmentList'
import type { AssistantMessageTranscriptProjection } from './model/assistantMessageMapper'
import type { AssistantMessageTextPlaybackModel } from './model/assistantMessageTextPlayback'

export interface AssistantMessageBodyModel {
  workStatus?: ChatMessage['workStatus']
  workStartedAt?: number
  workEndedAt?: number
  index: number
  isLatest: boolean
  animateOnMount?: boolean
  onTypingChange?: () => void
  transcript: AssistantMessageTranscriptProjection
  textPlayback: AssistantMessageTextPlaybackModel
}

export interface AssistantMessageBodyProps {
  model: AssistantMessageBodyModel
}

export const AssistantMessageBody: React.FC<AssistantMessageBodyProps> = memo(({
  model
}: AssistantMessageBodyProps) => {
  const {
    index,
    isLatest,
    onTypingChange,
    transcript,
    textPlayback
  } = model

  const lastSupportOrder = transcript.supportItems.at(-1)?.order ?? -1
  const processText = transcript.textItems.filter(item => item.order < lastSupportOrder)
  const answerText = transcript.textItems.filter(item => item.order > lastSupportOrder)
  const hasError = transcript.supportItems.some(item => item.segment.type === 'error')
  const hasPendingTool = transcript.supportItems.some(item => item.segment.type === 'toolCall'
    && (!item.segment.content?.status || ['pending', 'running'].includes(item.segment.content.status)))
  let status = model.workStatus ?? 'completed'
  if (hasError) status = 'failed'
  else if (status === 'completed' && (hasPendingTool || !answerText.some(item => item.segment.content.trim()))) {
    status = 'incomplete'
  }

  return (
    <>
      <div className="flex flex-col">
        <AssistantTextSegmentList
          index={index}
          committedPlaybackInput={textPlayback.committed}
          previewPlaybackInput={textPlayback.preview}
          isLatest={isLatest}
          animateOnMount={model.animateOnMount}
          onTypingChange={onTypingChange}
          items={answerText}
          isOverlayPreview={transcript.isOverlayPreview}
        />
        {transcript.supportItems.length > 0 && (
          <div style={{ order: -1 }}>
            <AssistantCompletedWorkGroup
              status={status}
              toolCount={transcript.supportItems.filter(item => item.segment.type === 'toolCall').length}
              startedAt={model.workStartedAt}
              endedAt={model.workEndedAt}
            >
              {processText.map(item => (
                <div key={item.key} style={{ order: item.order }}>
                  <AssistantTextSegmentContent segment={item.segment} isTyping={false} animateOnMount={false} />
                </div>
              ))}
              <AssistantSupportSegmentList
                units={transcript.supportUnits}
                nestedDisclosure
                onTypingChange={onTypingChange}
              />
            </AssistantCompletedWorkGroup>
          </div>
        )}
      </div>

    </>
  )
})
