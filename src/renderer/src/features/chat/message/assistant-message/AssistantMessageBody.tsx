import { parseImageShowResult, isImageDisplayTool } from '@shared/tools/image/types'
import { ImageShowResult } from './image/ImageShowResult'
import React, { memo, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { AssistantTextSegmentList } from './renderers/AssistantTextSegmentList'
import { AssistantCompletedWorkGroup } from './renderers/AssistantCompletedWorkGroup'
import { AssistantSupportSegmentList } from './renderers/AssistantSupportSegmentList'
import type { AssistantMessageTranscriptProjection } from './model/assistantMessageMapper'
import type { AssistantMessageTextPlaybackModel } from './model/assistantMessageTextPlayback'
import { projectCleanOutputContent } from './model/cleanOutput'
import { CleanOutputStatus } from './renderers/CleanOutputStatus'
import { CleanOutputReveal } from './renderers/CleanOutputReveal'
import { ErrorMessage } from '../error-message'

export interface AssistantMessageBodyModel {
  cleanOutput?: boolean
  cleanOutputActive?: boolean
  cleanOutputStatus?: string
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
  const observedCleanRun = useRef(false)
  const reducedMotion = useReducedMotion()
  if (!model.cleanOutput) observedCleanRun.current = false
  else if (model.cleanOutputActive) observedCleanRun.current = true

  const hasError = transcript.supportItems.some(item => item.segment.type === 'error')
  const hasPendingTool = transcript.supportItems.some(item => item.segment.type === 'toolCall'
    && (!item.segment.content?.status || ['pending', 'running'].includes(item.segment.content.status)))
  const hasShownImage = transcript.supportItems.some(item => item.segment.type === 'toolCall' && isImageDisplayTool(item.segment.name)
    && parseImageShowResult(item.segment.content?.result))
  let status = model.workStatus ?? 'completed'
  if (hasError) status = 'failed'
  else if (status === 'completed' && (hasPendingTool || (!hasShownImage && !transcript.textItems.some(item => item.segment.content.trim())))) {
    status = 'incomplete'
  }

  if (model.cleanOutput) {
    if (model.cleanOutputActive) {
      return <CleanOutputStatus label={model.cleanOutputStatus ?? 'Working…'} />
    }
    const content = projectCleanOutputContent(transcript)
    const revealCompleted = observedCleanRun.current && status === 'completed'
      && isLatest && model.animateOnMount !== false && !reducedMotion
    return (
      <div className="flex min-w-0 flex-col" data-testid="clean-output-content">
        {['failed', 'aborted', 'incomplete'].includes(status) && (
          <p className="px-2 text-xs text-(--chat-text-secondary)">
            {status === 'failed' ? 'Failed' : status === 'aborted' ? 'Stopped' : 'Incomplete response'}
          </p>
        )}
        <CleanOutputReveal reveal={revealCompleted}>
          <AssistantTextSegmentList
            index={index}
            committedPlaybackInput={textPlayback.committed}
            previewPlaybackInput={textPlayback.preview}
            isLatest={isLatest}
            animateOnMount={false}
            onTypingChange={onTypingChange}
            items={content.textItems}
            isOverlayPreview={transcript.isOverlayPreview}
          />
          {content.imageItems.map(item => <ImageShowResult key={item.key} toolCall={item.segment as ToolCallSegment} />)}
        </CleanOutputReveal>
        {content.errorItems.map(item => item.segment.type === 'error'
          ? <ErrorMessage key={item.key} error={item.segment.error} /> : null)}
        {!content.hasVisibleContent && (
          <p className="px-2 text-sm text-(--chat-text-secondary)">No response generated</p>
        )}
      </div>
    )
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
          items={transcript.textItems}
          isOverlayPreview={transcript.isOverlayPreview}
        />
        {transcript.supportItems.filter(item => item.segment.type === 'toolCall' && isImageDisplayTool(item.segment.name))
          .map(item => <ImageShowResult key={item.key} toolCall={item.segment as ToolCallSegment} />)}
        {transcript.supportItems.length > 0 && (
          <div style={{ order: -1 }}>
            <AssistantCompletedWorkGroup
              status={status}
              toolCount={transcript.supportItems.filter(item => item.segment.type === 'toolCall').length}
              startedAt={model.workStartedAt}
              endedAt={model.workEndedAt}
            >
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
AssistantMessageBody.displayName = 'AssistantMessageBody'
