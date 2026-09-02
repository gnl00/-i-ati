import React, { memo, useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { ChatForkInProgressError } from '@renderer/features/chat/state/chatCoordinatorStore'
import useChatRun from '@renderer/features/chat/runtime/useChatRun'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import {
  AssistantMessageLayout
} from './AssistantMessageLayout'
import {
  mapAssistantMessageIncrementally,
  type AssistantMessageProjectionIdentity,
  type AssistantMessageProjectionCache
} from './model/assistantMessageProjectionCache'
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
import type { CopyActionResult } from '../message-operations'

export interface AssistantMessageProps {
  index: number
  messageId?: number
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
  onCopyClick: (content: string) => CopyActionResult | Promise<CopyActionResult>
  onTypingChange?: () => void
}

const AssistantMessageContainerComponent: React.FC<AssistantMessageProps> = memo(({
  index,
  messageId,
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
  const forkCurrentChatFromMessage = useChatStore(state => state.forkCurrentChatFromMessage)
  const providerDefinitions = useAppConfigStore(state => state.providerDefinitions)
  const accounts = useAppConfigStore(state => state.accounts)
  const { onSubmit: handleChatSubmit } = useChatRun()
  const isForkingRef = useRef(false)
  const projectionCacheRef = useRef<AssistantMessageProjectionCache | undefined>(undefined)

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

  const projectionIdentity: AssistantMessageProjectionIdentity = messageId
    ?? committedMessage?.createdAt
    ?? `${index}:${committedMessage ? 'committed' : 'pending'}:${pendingModel?.modelRef?.accountId ?? pendingModel?.model ?? ''}`

  const projectionCache = useMemo(() => {
    return mapAssistantMessageIncrementally({
      committedMessage: displayCommittedMessage,
      previewMessage
    }, {
      isLatest,
      isStreaming,
      providerDefinitions,
      accounts
    }, projectionCacheRef.current, projectionIdentity)
  }, [
    displayCommittedMessage,
    previewMessage,
    isLatest,
    isStreaming,
    providerDefinitions,
    accounts,
    projectionIdentity
  ])
  useLayoutEffect(() => {
    projectionCacheRef.current = projectionCache
  }, [projectionCache])
  const renderState = projectionCache.renderState

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
    messageId,
    isLatest,
    isOverlayPreview: renderState.transcript.isOverlayPreview
  }), [
    displayCommittedMessage,
    messageId,
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

  const handleCopy = useCallback((): CopyActionResult | Promise<CopyActionResult> => {
    return onCopyClick(copyContentRef.current)
  }, [onCopyClick])

  const handleEdit = useCallback(() => {
    console.log('Edit assistant message:', index)
  }, [index])

  const handleBranch = useCallback(() => {
    if (isRunBusy) {
      toast.warning('Please wait for current response to finish')
      return
    }
    if (messageId == null || isForkingRef.current) {
      return
    }

    isForkingRef.current = true
    void forkCurrentChatFromMessage(messageId)
      .then(() => {
        toast.success('Chat branch created')
      })
      .catch((error: unknown) => {
        if (error instanceof ChatForkInProgressError) {
          toast.warning(error.message)
          return
        }
        console.error('[ChatBranch] Failed to create branch', error)
        toast.error('Failed to create chat branch')
      })
      .finally(() => {
        isForkingRef.current = false
      })
  }, [forkCurrentChatFromMessage, isRunBusy, messageId])

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
      modelProvider: renderState.header.modelProvider
    },
    badgeAnimate: isAssistantResponseActive && isLatest
  }), [
    renderState.header.badgeModel,
    renderState.header.modelProvider,
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
    onBranchClick: handleBranch,
    onEditClick: handleEdit
  }), [
    displayCommittedMessage.createdAt,
    tokenUsage,
    isHovered,
    footerState,
    handleCopy,
    handleRegenerate,
    handleBranch,
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
