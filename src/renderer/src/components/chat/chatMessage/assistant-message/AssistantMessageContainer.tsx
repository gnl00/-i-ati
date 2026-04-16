import React, { memo, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import useChatRun from '@renderer/hooks/useChatRun'
import { useAppConfigStore } from '@renderer/store/appConfig'
import {
  AssistantMessageLayout,
} from './AssistantMessageLayout'
import { mapAssistantMessage } from './model/assistantMessageMapper'
import {
  extractAssistantRegeneratePayload,
  findLatestRegeneratableUserMessage,
  getAssistantCopyContent
} from './model/assistantMessageContent'
import { buildAssistantMessageCommandState } from './model/assistantMessageCommandState'
import { buildAssistantMessageFooterState } from './model/assistantMessageFooterState'
import { buildAssistantMessageLayoutModels } from './model/assistantMessageLayoutModels'
import { buildAssistantMessageShellState } from './model/assistantMessageShellState'
import { buildAssistantMessageTextPlaybackModel } from './model/assistantMessageTextPlayback'

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

  const shellState = useMemo(() => buildAssistantMessageShellState({
    committedMessage,
    previewMessage,
    isCommandConfirmPending,
    isLatest,
    isResponseActive: isAssistantResponseActive
  }), [
    committedMessage,
    previewMessage,
    isCommandConfirmPending,
    isLatest,
    isAssistantResponseActive
  ])

  if (!shellState.shouldRender) {
    return null
  }

  const commandState = useMemo(() => buildAssistantMessageCommandState({
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  }), [
    isCommandConfirmPending,
    pendingToolConfirm,
    pendingToolConfirmCount
  ])

  const footerState = useMemo(() => buildAssistantMessageFooterState({
    committedMessage,
    isLatest,
    isOverlayPreview: renderState.transcript.isOverlayPreview
  }), [
    committedMessage,
    isLatest,
    renderState.transcript.isOverlayPreview
  ])

  const textPlayback = useMemo(() => buildAssistantMessageTextPlaybackModel({
    committedMessage,
    previewMessage
  }, renderState.transcript.textItems), [
    committedMessage,
    previewMessage,
    renderState.transcript.textItems
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

  const handleEdit = useCallback(() => {
    console.log('Edit assistant message:', index)
  }, [index])

  const layoutModels = useMemo(() => buildAssistantMessageLayoutModels({
    index,
    isLatest,
    committedMessage,
    isHovered,
    onHover,
    onTypingChange,
    headerProjection: renderState.header,
    transcriptProjection: renderState.transcript,
    textPlayback,
    commandState,
    footerState,
    badgeAnimate: isAssistantResponseActive && isLatest,
    onCopyClick: handleCopy,
    onRegenerateClick: handleRegenerate,
    onEditClick: handleEdit,
    onConfirmCommand: handleConfirmCommand,
    onCancelCommand: handleCancelCommand
  }), [
    index,
    isLatest,
    committedMessage,
    isHovered,
    onHover,
    onTypingChange,
    renderState.header,
    renderState.transcript,
    textPlayback,
    commandState,
    footerState,
    isAssistantResponseActive,
    handleCopy,
    handleRegenerate,
    handleEdit,
    handleConfirmCommand,
    handleCancelCommand
  ])

  return (
    <AssistantMessageLayout
      shell={layoutModels.shell}
      header={layoutModels.header}
      body={layoutModels.body}
      footer={layoutModels.footer}
    />
  )
})

export const AssistantMessageContainer = AssistantMessageContainerComponent
