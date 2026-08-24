import React, { memo } from 'react'
import { MessageOperations, type CopyActionHandler } from '../message-operations'
import type { AssistantMessageTokenUsageDisplay } from './model/assistantMessageTokenUsage'

export interface AssistantMessageFooterActionsModel {
  messageMeta?: Pick<ChatMessage, 'createdAt'>
  tokenUsageDisplay?: AssistantMessageTokenUsageDisplay
  isHovered: boolean
  showOperations: boolean
  showRegenerate: boolean
  showBranch: boolean
  onCopyClick: CopyActionHandler
  onRegenerateClick: () => void
  onBranchClick: () => void
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
    showBranch,
    onCopyClick,
    onRegenerateClick,
    onBranchClick,
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
      showBranch={showBranch}
      onCopyClick={onCopyClick}
      onRegenerateClick={onRegenerateClick}
      onBranchClick={onBranchClick}
      onEditClick={onEditClick}
    />
  )
})
