import React, { memo } from 'react'
import { MessageOperations } from '../message-operations'

export interface AssistantMessageFooterActionsModel {
  committedMessage: ChatMessage
  isHovered: boolean
  showOperations: boolean
  showRegenerate: boolean
  onCopyClick: () => void
  onRegenerateClick: () => void
  onEditClick: () => void
}

export interface AssistantMessageFooterActionsProps {
  model: AssistantMessageFooterActionsModel
}

export const AssistantMessageFooterActions: React.FC<AssistantMessageFooterActionsProps> = memo(({
  model
}) => {
  const {
    committedMessage,
    isHovered,
    showOperations,
    showRegenerate,
    onCopyClick,
    onRegenerateClick,
    onEditClick
  } = model

  if (!showOperations) {
    return null
  }

  return (
    <MessageOperations
      message={committedMessage}
      type="assistant"
      isHovered={isHovered}
      showRegenerate={showRegenerate}
      onCopyClick={onCopyClick}
      onRegenerateClick={onRegenerateClick}
      onEditClick={onEditClick}
    />
  )
})
