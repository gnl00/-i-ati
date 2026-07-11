import React, { memo, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import useChatRun from '@renderer/features/chat/runtime/useChatRun'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import {
  AssistantMessageLayout
} from './AssistantMessageLayout'
import { mapAssistantMessage } from './model/assistantMessageMapper'
import {
  extractAssistantRegeneratePayload,
  findLatestRegeneratableUserMessage,
  getAssistantCopyContent
} from './model/assistantMessageContent'
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
  committedMessage?: ChatMessage
  pendingModel?: {
    model?: string
    modelRef?: ModelRef
  }
  tokenUsage?: ITokenUsage
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
  pendingModel,
  tokenUsage,
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

  const isRunBusy = runPhase !== 'idle'
  const isAssistantResponseActive = runPhase === 'submitting' || runPhase === 'streaming'
  const isStreaming = runPhase === 'streaming'
  const displayCommittedMessage = useMemo<ChatMessage>(() => (
    committedMessage ?? {
      role: 'assistant',
      source: 'stream_preview',
      model: pendingModel?.model,
      modelRef: pendingModel?.modelRef,
      content: '',
      segments: [],
      typewriterCompleted: false
    }
  ), [
    committedMessage,
    pendingModel?.model,
    pendingModel?.modelRef
  ])

  const renderState = useMemo(() => mapAssistantMessage({
    committedMessage: displayCommittedMessage,
    previewMessage
  }, {
    isLatest,
    isStreaming,
    providerDefinitions,
    accounts
  }), [displayCommittedMessage, previewMessage, isLatest, isStreaming, providerDefinitions, accounts])

  const shellState = useMemo(() => buildAssistantMessageShellState({
    committedMessage: displayCommittedMessage,
    previewMessage,
    isLatest,
    isResponseActive: isAssistantResponseActive
  }), [
    displayCommittedMessage,
    previewMessage,
    isLatest,
    isAssistantResponseActive
  ])

  if (!shellState.shouldRender) {
    return null
  }

  const footerState = useMemo(() => buildAssistantMessageFooterState({
    committedMessage: displayCommittedMessage,
    isLatest,
    isOverlayPreview: renderState.transcript.isOverlayPreview
  }), [
    displayCommittedMessage,
    isLatest,
    renderState.transcript.isOverlayPreview
  ])

  const textPlayback = useMemo(() => buildAssistantMessageTextPlaybackModel({
    committedMessage: displayCommittedMessage,
    previewMessage
  }, renderState.transcript.textItems), [
    displayCommittedMessage,
    previewMessage,
    renderState.transcript.textItems
  ])
  const copyContentRef = useRef(getAssistantCopyContent(previewMessage ?? displayCommittedMessage))
  copyContentRef.current = getAssistantCopyContent(previewMessage ?? displayCommittedMessage)

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
    textPlayback
  }), [
    index,
    isLatest,
    onTypingChange,
    renderState.transcript,
    textPlayback
  ])

  const footerModel = useMemo(() => buildAssistantMessageFooterModel({
    committedMessage: displayCommittedMessage,
    tokenUsage,
    isHovered,
    footerState,
    onCopyClick: handleCopy,
    onRegenerateClick: handleRegenerate,
    onEditClick: handleEdit
  }), [
    displayCommittedMessage.createdAt,
    tokenUsage,
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
