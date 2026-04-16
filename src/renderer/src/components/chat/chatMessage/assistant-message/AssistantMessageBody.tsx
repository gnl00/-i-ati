import React, { memo } from 'react'
import { CommandConfirmation, type CommandConfirmationRequest } from './CommandConfirmation'
import { AssistantTextSegmentList } from './renderers/AssistantTextSegmentList'
import { AssistantSupportSegmentList } from './renderers/AssistantSupportSegmentList'
import type { AssistantMessageTranscriptProjection } from './model/assistantMessageMapper'
import type { AssistantMessageTextPlaybackModel } from './model/assistantMessageTextPlayback'

export interface AssistantMessageBodyModel {
  index: number
  isLatest: boolean
  onTypingChange?: () => void
  transcript: AssistantMessageTranscriptProjection
  textPlayback: AssistantMessageTextPlaybackModel
  commandConfirmationRequest?: CommandConfirmationRequest
  onConfirmCommand: () => void
  onCancelCommand: () => void
}

export interface AssistantMessageBodyProps {
  model: AssistantMessageBodyModel
}

export const AssistantMessageBody: React.FC<AssistantMessageBodyProps> = memo(({
  model
}) => {
  const {
    index,
    isLatest,
    onTypingChange,
    transcript,
    textPlayback,
    commandConfirmationRequest,
    onConfirmCommand,
    onCancelCommand
  } = model

  return (
    <>
      <div className="flex flex-col">
        <AssistantTextSegmentList
          index={index}
          committedPlaybackInput={textPlayback.committed}
          previewPlaybackInput={textPlayback.preview}
          isLatest={isLatest}
          onTypingChange={onTypingChange}
          items={transcript.textItems}
          isOverlayPreview={transcript.isOverlayPreview}
        />
        <AssistantSupportSegmentList items={transcript.supportItems} />
      </div>

      {commandConfirmationRequest && (
        <CommandConfirmation
          request={commandConfirmationRequest}
          onConfirm={onConfirmCommand}
          onCancel={onCancelCommand}
        />
      )}
    </>
  )
})
