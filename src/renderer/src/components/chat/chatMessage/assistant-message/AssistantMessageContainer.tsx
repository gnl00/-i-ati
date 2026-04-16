import React, { memo, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@renderer/store/chatStore'
import { useToolConfirmationStore } from '@renderer/store/toolConfirmation'
import useChatRun from '@renderer/hooks/useChatRun'
import { useAppConfigStore } from '@renderer/store/appConfig'
import {
  AssistantMessageLayout
} from './AssistantMessageLayout'
import { mapAssistantMessage } from './model/assistantMessageMapper'
import {
  extractAssistantRegeneratePayload,
  findLatestRegeneratableUserMessage,
  getAssistantCopyContent
} from './model/assistantMessageContent'
import { buildAssistantMessageCommandState } from './model/assistantMessageCommandState'
import { buildAssistantMessageFooterState } from './model/assistantMessageFooterState'
import { buildAssistantMessageShellState } from './model/assistantMessageShellState'
import { buildAssistantMessageTextPlaybackModel } from './model/assistantMessageTextPlayback'
import {
  buildAssistantMessageBodyModel,
  buildAssistantMessageFooterModel,
  buildAssistantMessageHeaderModel,
  buildAssistantMessageShellModel
} from './model/assistantMessageLayoutModels'

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
  const copyContentRef = useRef(getAssistantCopyContent(previewMessage ?? committedMessage))
  copyContentRef.current = getAssistantCopyContent(previewMessage ?? committedMessage)

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
    onCopyClick(copyContentRef.current)
  }, [onCopyClick])

  const handleEdit = useCallback(() => {
    console.log('Edit assistant message:', index)
  }, [index])

  const shellModel = useMemo(() => buildAssistantMessageShellModel({
    index,
    isLatest,
    onHover
  }), [
    index,
    isLatest,
    onHover
  ])

  const headerModel = useMemo(() => buildAssistantMessageHeaderModel({
    headerProjection: {
      badgeModel: renderState.header.badgeModel,
      modelProvider: renderState.header.modelProvider,
      emotionLabel: renderState.header.emotionLabel,
      emotionEmoji: renderState.header.emotionEmoji,
      emotionIntensity: renderState.header.emotionIntensity
    },
    badgeAnimate: isAssistantResponseActive && isLatest
  }), [
    renderState.header.badgeModel,
    renderState.header.modelProvider,
    renderState.header.emotionLabel,
    renderState.header.emotionEmoji,
    renderState.header.emotionIntensity,
    isAssistantResponseActive,
    isLatest
  ])

  const bodyModel = useMemo(() => buildAssistantMessageBodyModel({
    index,
    isLatest,
    onTypingChange,
    transcriptProjection: renderState.transcript,
    textPlayback,
    commandState,
    onConfirmCommand: handleConfirmCommand,
    onCancelCommand: handleCancelCommand
  }), [
    index,
    isLatest,
    onTypingChange,
    renderState.transcript,
    textPlayback,
    commandState,
    handleConfirmCommand,
    handleCancelCommand
  ])

  const footerModel = useMemo(() => buildAssistantMessageFooterModel({
    committedMessage,
    isHovered,
    footerState,
    onCopyClick: handleCopy,
    onRegenerateClick: handleRegenerate,
    onEditClick: handleEdit
  }), [
    committedMessage.createdAt,
    isHovered,
    footerState,
    handleCopy,
    handleRegenerate,
    handleEdit
  ])

  return (
    <AssistantMessageLayout
      shell={shellModel}
      header={headerModel}
      body={bodyModel}
      footer={footerModel}
    />
  )
})

export const AssistantMessageContainer = AssistantMessageContainerComponent
