import React, { memo, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import useChatRun from '@renderer/hooks/useChatRun'
import { useAppConfigStore } from '@renderer/store/appConfig'
import {
  shouldRenderAssistantMessageShell
} from './assistant-message-visibility'
import {
  AssistantMessageLayout,
  type AssistantMessageShellModel
} from './AssistantMessageLayout'
import { mapAssistantMessage } from './model/assistantMessageMapper'
import {
  extractAssistantRegeneratePayload,
  findLatestRegeneratableUserMessage,
  getAssistantCopyContent
} from './model/assistantMessageContent'
import { buildAssistantMessageLayoutState } from './model/assistantMessageLayoutState'
import type { AssistantMessageHeaderModel } from './AssistantMessageHeader'
import type { AssistantMessageBodyModel } from './AssistantMessageBody'
import type { AssistantMessageFooterActionsModel } from './AssistantMessageFooterActions'

export interface AssistantMessageProps {
  index: number
  committedMessage: ChatMessage
  previewMessage?: ChatMessage
  isLatest: boolean
  isHovered: boolean
  onHover: (hovered: boolean) => void
  onCopyClick: (content: string) => void
  onTypingChange?: () => void
}

const AssistantMessageContainerComponent: React.FC<AssistantMessageProps> = memo(({
  index,
  committedMessage,
  previewMessage,
  isLatest,
  isHovered,
  onHover,
  onCopyClick,
  onTypingChange
}) => {
  const runPhase = useChatStore(state => state.runPhase)
  const messages = useChatStore(state => state.messages)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const providerDefinitions = useAppConfigStore(state => state.providerDefinitions)
  const accounts = useAppConfigStore(state => state.accounts)
  const { onSubmit: handleChatSubmit } = useChatRun()

  const pendingToolConfirm = useToolConfirmationStore(state => state.pendingRequests[0] ?? null)
  const pendingToolConfirmCount = useToolConfirmationStore(state => state.pendingRequests.length)
  const confirm = useToolConfirmationStore(state => state.confirm)
  const cancel = useToolConfirmationStore(state => state.cancel)

  const isCommandConfirmPending = isLatest && pendingToolConfirm?.name === 'execute_command'
  const isRunBusy = runPhase !== 'idle'
  const isAssistantResponseActive = runPhase === 'submitting' || runPhase === 'streaming'
  const isStreaming = runPhase === 'streaming'

  const renderState = useMemo(() => mapAssistantMessage({
    committedMessage,
    previewMessage
  }, {
    isLatest,
    isStreaming,
    providerDefinitions,
    accounts
  }), [committedMessage, previewMessage, isLatest, isStreaming, providerDefinitions, accounts])

  if (!shouldRenderAssistantMessageShell({
    hasContent: renderState.presence.hasContent,
    hasSegments: renderState.presence.hasSegments,
    hasToolCalls: renderState.presence.hasToolCalls,
    isCommandConfirmPending,
    isLatest,
    isResponseActive: isAssistantResponseActive
  })) {
    return null
  }

  const layoutState = useMemo(() => buildAssistantMessageLayoutState({
    committedMessage,
    isLatest,
    isOverlayPreview: renderState.blocks.isOverlayPreview,
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  }), [
    committedMessage,
    isLatest,
    renderState.blocks.isOverlayPreview,
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  ])

  const handleRegenerate = useCallback(() => {
    if (isRunBusy) {
      toast.warning('Please wait for current response to finish')
      return
    }
    if (!selectedModelRef) {
      toast.warning('Please select a model')
      return
    }

    const lastUserMessage = findLatestRegeneratableUserMessage(messages)
    if (!lastUserMessage) {
      toast.warning('No user message available to regenerate')
      return
    }

    const payload = extractAssistantRegeneratePayload(lastUserMessage)
    if (!payload) {
      toast.warning('Last user message has no valid content to regenerate')
      return
    }

    void handleChatSubmit(payload.text, payload.images, {})
  }, [handleChatSubmit, isRunBusy, messages, selectedModelRef])

  const handleConfirmCommand = useCallback(() => {
    if (!pendingToolConfirm) return
    confirm(pendingToolConfirm.toolCallId)
  }, [confirm, pendingToolConfirm])

  const handleCancelCommand = useCallback(() => {
    if (!pendingToolConfirm) return
    cancel('user abort', pendingToolConfirm.toolCallId)
  }, [cancel, pendingToolConfirm])

  const handleCopy = useCallback(() => {
    onCopyClick(getAssistantCopyContent(previewMessage ?? committedMessage))
  }, [committedMessage, onCopyClick, previewMessage])

  const shell = useMemo<AssistantMessageShellModel>(() => ({
    index,
    isLatest,
    onHover
  }), [index, isLatest, onHover])

  const header = useMemo<AssistantMessageHeaderModel>(() => ({
    header: renderState.header,
    badgeAnimate: isAssistantResponseActive && isLatest
  }), [renderState.header, isAssistantResponseActive, isLatest])

  const body = useMemo<AssistantMessageBodyModel>(() => ({
    index,
    isLatest,
    onTypingChange,
    blocks: renderState.blocks,
    playback: renderState.playback,
    showCommandConfirmation: layoutState.showCommandConfirmation,
    commandConfirmationRequest: layoutState.commandConfirmationRequest,
    onConfirmCommand: handleConfirmCommand,
    onCancelCommand: handleCancelCommand
  }), [
    index,
    isLatest,
    onTypingChange,
    renderState.blocks,
    renderState.playback,
    layoutState.showCommandConfirmation,
    layoutState.commandConfirmationRequest,
    handleConfirmCommand,
    handleCancelCommand
  ])

  const footer = useMemo<AssistantMessageFooterActionsModel>(() => ({
    committedMessage,
    isHovered,
    showOperations: layoutState.showOperations,
    showRegenerate: layoutState.showRegenerate,
    onCopyClick: handleCopy,
    onRegenerateClick: handleRegenerate,
    onEditClick: () => {
      console.log('Edit assistant message:', index)
    }
  }), [
    committedMessage,
    isHovered,
    layoutState.showOperations,
    layoutState.showRegenerate,
    handleCopy,
    handleRegenerate,
    index
  ])

  return (
    <AssistantMessageLayout
      shell={shell}
      header={header}
      body={body}
      footer={footer}
    />
  )
})

export const AssistantMessageContainer = AssistantMessageContainerComponent
