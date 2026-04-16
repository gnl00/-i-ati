import React, { memo } from 'react'
import { MessageOperations } from '../message-operations'

export interface AssistantMessageFooterActionsModel {
  messageMeta?: Pick<ChatMessage, 'createdAt'>
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
    messageMeta,
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
      message={messageMeta}
      type="assistant"
      isHovered={isHovered}
      showRegenerate={showRegenerate}
      onCopyClick={onCopyClick}
      onRegenerateClick={onRegenerateClick}
      onEditClick={onEditClick}
    />
  )
})
