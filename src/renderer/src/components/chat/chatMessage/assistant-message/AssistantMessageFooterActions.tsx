import React, { memo } from 'react'
import { MessageOperations } from '../message-operations'
import type { AssistantMessageTokenUsageDisplay } from './model/assistantMessageTokenUsage'

export interface AssistantMessageFooterActionsModel {
  messageMeta?: Pick<ChatMessage, 'createdAt'>
  tokenUsageDisplay?: AssistantMessageTokenUsageDisplay
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
    tokenUsageDisplay,
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
      tokenUsageDisplay={tokenUsageDisplay}
      type="assistant"
      isHovered={isHovered}
      showRegenerate={showRegenerate}
      onCopyClick={onCopyClick}
      onRegenerateClick={onRegenerateClick}
      onEditClick={onEditClick}
    />
  )
})
