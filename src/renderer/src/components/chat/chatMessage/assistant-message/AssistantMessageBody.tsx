import React, { memo } from 'react'
import { CommandConfirmation, type CommandConfirmationRequest } from './CommandConfirmation'
import { AssistantTextSegmentList } from './renderers/AssistantTextSegmentList'
import { AssistantSupportSegmentList } from './renderers/AssistantSupportSegmentList'
import type { AssistantMessageRenderState } from './model/assistantMessageMapper'

export interface AssistantMessageBodyModel {
  index: number
  isLatest: boolean
  onTypingChange?: () => void
  blocks: AssistantMessageRenderState['blocks']
  playback: AssistantMessageRenderState['playback']
  showCommandConfirmation: boolean
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
    blocks,
    playback,
    showCommandConfirmation,
    commandConfirmationRequest,
    onConfirmCommand,
    onCancelCommand
  } = model

  return (
    <>
      <div className="flex flex-col">
        <AssistantTextSegmentList
          index={index}
          committedPlaybackInput={playback.committed}
          previewPlaybackInput={playback.preview}
          isLatest={isLatest}
          onTypingChange={onTypingChange}
          items={blocks.textItems}
          isOverlayPreview={blocks.isOverlayPreview}
        />
        <AssistantSupportSegmentList items={blocks.supportItems} />
      </div>

      {showCommandConfirmation && commandConfirmationRequest && (
        <CommandConfirmation
          request={commandConfirmationRequest}
          onConfirm={onConfirmCommand}
          onCancel={onCancelCommand}
        />
      )}
    </>
  )
})
