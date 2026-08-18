import ChatImageGallery from '@renderer/features/chat/shell/ChatImageGallery'
import useChatRun, { getActiveChatRunIdentity } from '@renderer/features/chat/runtime/useChatRun'
import { useSlashCommands } from '@renderer/features/chat/input/useSlashCommands'
import { useMcpConnection } from '@renderer/features/settings'
import { cn } from '@renderer/shared/lib/utils'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  getEffectiveThinkingLevel,
  getRequestAdapterThinkingCapability,
  toUnifiedRequestThinkingOption
} from '@shared/plugins/requestAdapterThinking'
import { CustomCaretOverlay, CustomCaretRef } from '../common/CustomCaretOverlay'
import CommandPalette from './CommandPalette'
import ChatInputToolbar from './ChatInputToolbar'
import ChatInputActions from './ChatInputActions'
import SharedPromptSurface from './SharedPromptSurface'
import { QueuedMessageRail } from './QueuedMessageRail'
import { invokeCheckIsDirectory } from '@renderer/infrastructure/ipc'
import { RUN_STEERING_LIMITS, type RunSteerResult } from '@shared/run/steering-events'
import { v4 as uuidv4 } from 'uuid'
import {
  isSubmissionBlocked,
  shouldQueueSubmission as getShouldQueueSubmission,
  type QueuedChatMessage,
  type QueuedChatMessagePayload
} from './queuePolicy'
import {
  EMPTY_CHAT_INPUT_QUEUE_OWNER,
  getChatInputQueueKey,
  selectQueuedPayloadForFlush,
  useChatInputQueueStore,
  type ChatInputQueueScope
} from './chatInputQueueStore'
import { useToolUserQuestionStore } from '@renderer/features/chat/state/toolUserQuestionStore'

interface ChatInputAreaProps {
  onMessagesUpdate?: () => void
  welcomeVisualMode?: boolean
  onWelcomeFocusStateChange?: (focused: boolean) => void
}

export interface ChatInputAreaHandle {
  fillInput: (text: string) => void
}

function getSteerRejectionMessage(reason: RunSteerResult['reason']): string {
  switch (reason) {
    case 'queue_full':
      return 'The current run insert queue is full'
    case 'payload_too_large':
      return 'Queued message is too large. Edit or remove it'
    case 'invalid_request':
      return 'Queued message is invalid. Edit or remove it'
    case 'chat_mismatch':
      return 'The active run belongs to another chat'
    case 'run_not_found':
    case 'run_finished':
    default:
      return 'The current run has already finished'
  }
}

const ChatInputArea = React.forwardRef<ChatInputAreaHandle, ChatInputAreaProps>(({
  onMessagesUpdate,
  welcomeVisualMode = false,
  onWelcomeFocusStateChange,
}, ref) => {
  // Use Zustand selectors to avoid unnecessary re-renders
  // Only subscribe to specific state slices instead of the entire store
  const imageSrcBase64List = useChatStore(state => state.imageSrcBase64List)
  const setImageSrcBase64List = useChatStore(state => state.setImageSrcBase64List)
  const runPhase = useChatStore(state => state.runPhase)
  const postRunJobs = useChatStore(state => state.postRunJobs)
  const messages = useChatStore(state => state.messages)
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const selectedThinkingLevel = useChatStore(state => state.selectedThinkingLevel)
  const permissionApprovalMode = useChatStore(state => state.permissionApprovalMode)
  const setSelectedModelRef = useChatStore(state => state.setSelectedModelRef)
  const setSelectedThinkingLevel = useChatStore(state => state.setSelectedThinkingLevel)
  const setPermissionApprovalMode = useChatStore(state => state.setPermissionApprovalMode)
  const ensureSelectedModelRef = useChatStore(state => state.ensureSelectedModelRef)
  const editUserInstructionDraft = useChatStore(state => state.editUserInstructionDraft)
  const hasPendingUserQuestion = useToolUserQuestionStore(state => state.pendingRequests.length > 0)

  const {
    mainModel,
    getModelOptions,
    resolveModelRef,
    providersRevision,
    plugins,
    mcpServerConfig,
  } = useAppConfigStore()

  const modelOptions = useMemo(() => {
    return getModelOptions()
  }, [getModelOptions, providersRevision])

  const selectedModel = useMemo(() => {
    return resolveModelRef(selectedModelRef ?? mainModel)
  }, [mainModel, providersRevision, resolveModelRef, selectedModelRef])
  const thinkingCapability = useMemo(() => {
    if (!selectedModel) {
      return undefined
    }

    return getRequestAdapterThinkingCapability({
      plugins,
      pluginId: selectedModel.definition.adapterPluginId,
      baseUrl: selectedModel.account.apiUrl,
      modelId: selectedModel.model.id,
      payloadExtensions: selectedModel.definition.payloadExtensions
    })
  }, [plugins, selectedModel])
  const effectiveThinkingLevel = getEffectiveThinkingLevel(
    selectedModel?.model,
    thinkingCapability,
    selectedThinkingLevel
  )

  useEffect(() => {
    if (!effectiveThinkingLevel) {
      if (selectedThinkingLevel) {
        setSelectedThinkingLevel(undefined)
      }
      return
    }

    if (selectedThinkingLevel !== effectiveThinkingLevel) {
      setSelectedThinkingLevel(effectiveThinkingLevel)
    }
  }, [effectiveThinkingLevel, selectedThinkingLevel, setSelectedThinkingLevel])

  useEffect(() => {
    if (!selectedModel) {
      ensureSelectedModelRef()
    }
  }, [ensureSelectedModelRef, selectedModel, modelOptions.length, mainModel])

  // Use MCP connection hook
  const {
    syncWithConfig: syncMcpRuntimeWithConfig,
    hydrateFromRuntime: hydrateMcpRuntime
  } = useMcpConnection()

  useEffect(() => {
    void hydrateMcpRuntime()
  }, [hydrateMcpRuntime])

  useEffect(() => {
    void syncMcpRuntimeWithConfig(mcpServerConfig)
  }, [mcpServerConfig, syncMcpRuntimeWithConfig])

  const activeRunIdentity = getActiveChatRunIdentity(currentChatUuid)
  const queueScope = useMemo<ChatInputQueueScope>(() => ({
    chatUuid: currentChatUuid,
    submissionId: activeRunIdentity?.submissionId ?? null
  }), [activeRunIdentity?.submissionId, currentChatUuid])
  const queueKey = getChatInputQueueKey(queueScope)
  const queueOwner = useChatInputQueueStore(state => (
    state.owners[queueKey] ?? EMPTY_CHAT_INPUT_QUEUE_OWNER
  ))
  const queuedMessages = queueOwner.messages
  const queuePaused = queueOwner.paused
  const editingQueue = Boolean(queueOwner.editingMessage)
  const setQueuedMessages = useCallback((update: React.SetStateAction<QueuedChatMessage[]>) => {
    useChatInputQueueStore.getState().setMessages(queueScope, update)
  }, [queueScope])
  const setQueuePaused = useCallback((paused: boolean) => {
    useChatInputQueueStore.getState().setPaused(queueScope, paused)
  }, [queueScope])

  const [inputContent, setInputContent] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [workspacePathToSelect, setWorkspacePathToSelect] = useState<string | null>(null)
  const [modelMenuCollisionBoundary, setModelMenuCollisionBoundary] = useState<HTMLElement | null>(null)
  const [isWelcomeFocused, setIsWelcomeFocused] = useState<boolean>(false)
  const [isWelcomePopoverOpen, setIsWelcomePopoverOpen] = useState<boolean>(false)
  const [isWelcomeInteractionHeld, setIsWelcomeInteractionHeld] = useState<boolean>(false)

  // Textarea ref
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Custom Caret Ref
  const caretOverlayRef = useRef<CustomCaretRef>(null)
  const queueTimerRef = useRef<number | null>(null)
  const welcomeInteractionReleaseTimerRef = useRef<number | null>(null)
  const queueFlushingRef = useRef(false)
  const isComposingRef = useRef(false)
  const previousQueueKeyRef = useRef(queueKey)
  const activeQueueKeyRef = useRef(queueKey)
  activeQueueKeyRef.current = queueKey

  // Callback to handle command execution with textarea cleanup
  const handleCommandExecute = useCallback((_command: any) => {
    const textarea = textareaRef.current
    if (textarea) {
      const cursorPos = textarea.selectionStart
      const beforeCursor = inputContent.slice(0, cursorPos)
      const afterCursor = inputContent.slice(cursorPos)
      const lastSlashIndex = beforeCursor.lastIndexOf('/')

      if (lastSlashIndex > -1) {
        const newContent = beforeCursor.slice(0, lastSlashIndex) + afterCursor
        setInputContent(newContent)

        requestAnimationFrame(() => {
          textarea.focus()
          textarea.setSelectionRange(lastSlashIndex, lastSlashIndex)
          caretOverlayRef.current?.updateCaret()
        })
      }
    }
  }, [inputContent])

  // Use enhanced slash commands hook
  const {
    startNewChat: startNewChatBase,
    isOpen: commandPanelOpen,
    selectedIndex: selectedCommandIndex,
    filteredCommands,
    executeCommand,
    handleKeyDown: handleCommandKeyDown,
    handleInputChange: handleCommandInputChange,
    handleBlur: handleCommandBlur
  } = useSlashCommands({
    textareaRef,
    onCommandExecute: handleCommandExecute
  })

  const fillInput = useCallback((text: string) => {
    setInputContent(text)
    handleCommandInputChange(text)

    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.focus()
      textarea.value = text
      textarea.setSelectionRange(text.length, text.length)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      caretOverlayRef.current?.updateCaret(true)
    })
  }, [handleCommandInputChange])

  useImperativeHandle(ref, () => ({
    fillInput
  }), [fillInput])

  const setInputAreaContentRef = useCallback((node: HTMLDivElement | null) => {
    setModelMenuCollisionBoundary(node)
  }, [])

  const updateWelcomeFocus = useCallback((focused: boolean) => {
    setIsWelcomeFocused(current => current === focused ? current : focused)
    onWelcomeFocusStateChange?.(focused)
  }, [onWelcomeFocusStateChange])

  const holdWelcomeInteraction = useCallback(() => {
    if (!welcomeVisualMode) {
      return
    }

    if (welcomeInteractionReleaseTimerRef.current) {
      window.clearTimeout(welcomeInteractionReleaseTimerRef.current)
      welcomeInteractionReleaseTimerRef.current = null
    }

    setIsWelcomeInteractionHeld(true)
  }, [welcomeVisualMode])

  const releaseWelcomeInteraction = useCallback((delay = 120) => {
    if (!welcomeVisualMode) {
      return
    }

    if (welcomeInteractionReleaseTimerRef.current) {
      window.clearTimeout(welcomeInteractionReleaseTimerRef.current)
    }

    welcomeInteractionReleaseTimerRef.current = window.setTimeout(() => {
      setIsWelcomeInteractionHeld(false)
      welcomeInteractionReleaseTimerRef.current = null
    }, delay)
  }, [welcomeVisualMode])

  useEffect(() => {
    if (welcomeVisualMode) {
      return
    }

    updateWelcomeFocus(false)
    setIsWelcomePopoverOpen(false)
    setIsWelcomeInteractionHeld(false)
  }, [updateWelcomeFocus, welcomeVisualMode])

  useEffect(() => {
    return () => {
      if (welcomeInteractionReleaseTimerRef.current) {
        window.clearTimeout(welcomeInteractionReleaseTimerRef.current)
        welcomeInteractionReleaseTimerRef.current = null
      }
    }
  }, [])

  // Extend startNewChat to include local state reset
  const startNewChat = useCallback(() => {
    if (!currentChatUuid) {
      useChatInputQueueStore.getState().clear(queueScope)
    }
    startNewChatBase()
    editUserInstructionDraft('')
  }, [currentChatUuid, editUserInstructionDraft, queueScope, startNewChatBase])

  const {
    onSubmit: handleChatSubmit,
    cancel: cancelChatSubmit,
    steer: steerChatRun
  } = useChatRun()
  const handleChatSubmitCallback = useCallback((text, img, options) => {
    handleChatSubmit(text, img, options)
  }, [handleChatSubmit])
  const submitMessage = useCallback((payload: QueuedChatMessagePayload) => {
    onMessagesUpdate?.()
    const thinking = toUnifiedRequestThinkingOption(effectiveThinkingLevel)
    handleChatSubmitCallback(payload.text, payload.images, {
      options: thinking ? { thinking } : undefined
    })
  }, [effectiveThinkingLevel, handleChatSubmitCallback, onMessagesUpdate])

  const enqueueMessage = useCallback((payload: QueuedChatMessagePayload) => {
    if (queuedMessages.length >= RUN_STEERING_LIMITS.maxPendingItems) {
      toast.warning(`Queue is full (max ${RUN_STEERING_LIMITS.maxPendingItems})`)
      return
    }
    setQueuedMessages(prev => [...prev, {
      ...payload,
      id: uuidv4(),
      status: 'queued'
    }])
    setInputContent('')
    setImageSrcBase64List([])

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = ''
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }))
        caretOverlayRef.current?.updateCaret()
      }
    })
  }, [queuedMessages.length, setImageSrcBase64List, setQueuedMessages])

  const isSubmitBlocked = isSubmissionBlocked(runPhase, postRunJobs)
  const shouldQueueSubmission = getShouldQueueSubmission({
    runPhase,
    postRunJobs,
    queuePaused,
    queuedMessageCount: queuedMessages.length
  })
  const isWelcomeExpanded = welcomeVisualMode && (
    isWelcomeFocused ||
    isWelcomePopoverOpen ||
    isWelcomeInteractionHeld ||
    inputContent.trim().length > 0 ||
    imageSrcBase64List.length > 0
  )

  const onSubmitClick = useCallback((_event?: React.MouseEvent | React.KeyboardEvent, overrideText?: string) => {
    const rawInput = overrideText ?? inputContent
    const trimmedInput = rawInput.trim()
    if (!trimmedInput) {
      return
    }
    if (hasPendingUserQuestion) {
      toast.info('Answer the pending question to continue')
      return
    }
    const activeModelRef = ensureSelectedModelRef()
    if (!activeModelRef) {
      toast.warning('Please select a model')
      return
    }

    setQueuePaused(false)

    const payload = {
      text: trimmedInput,
      images: imageSrcBase64List
    }

    if (editingQueue) {
      const editingItem = queueOwner.editingMessage
      const editedPayload = {
        text: trimmedInput,
        images: imageSrcBase64List
      }

      setInputContent('')
      setImageSrcBase64List([])

      if (shouldQueueSubmission) {
        useChatInputQueueStore.getState().finishEditing(queueScope, {
          ...editedPayload,
          id: editingItem?.id ?? uuidv4(),
          status: 'queued'
        })
        return
      }

      useChatInputQueueStore.getState().finishEditing(queueScope)
      useChatStore.getState().forceCompleteTypewriter?.()
      submitMessage(editedPayload)
      return
    }

    if (shouldQueueSubmission) {
      enqueueMessage(payload)
      return
    }

    useChatStore.getState().forceCompleteTypewriter?.()
    submitMessage(payload)
    setInputContent('')
    setImageSrcBase64List([])

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = ''
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }))
        caretOverlayRef.current?.updateCaret()
      }
    })
  }, [
    inputContent,
    imageSrcBase64List,
    selectedModelRef,
    ensureSelectedModelRef,
    queuePaused,
    editingQueue,
    queueOwner.editingMessage,
    queueScope,
    queuedMessages.length,
    shouldQueueSubmission,
    enqueueMessage,
    submitMessage,
    setImageSrcBase64List,
    setQueuePaused,
    hasPendingUserQuestion
  ])

  const insertQueuedMessage = useCallback(async () => {
    const first = queuedMessages[0]
    const canSteerCurrentRun = runPhase === 'submitting' || runPhase === 'streaming'
    if (
      !first
      || first.status !== 'queued'
      || queuePaused
      || !canSteerCurrentRun
      || hasPendingUserQuestion
    ) {
      return
    }

    setQueuedMessages(prev => prev.map((item, index) => (
      index === 0 && item.id === first.id
        ? { ...item, status: 'inserting' }
        : item
    )))

    try {
      const result = await steerChatRun({
        queueItemId: first.id,
        text: first.text,
        images: first.images
      })
      if (result.accepted) {
        return
      }

      setQueuedMessages(prev => prev.map(item => (
        item.id === first.id ? { ...item, status: 'queued' } : item
      )))
      toast.warning(getSteerRejectionMessage(result.reason))
    } catch {
      setQueuedMessages(prev => prev.map(item => (
        item.id === first.id ? { ...item, status: 'queued' } : item
      )))
      toast.error('Failed to insert queued message')
    }
  }, [hasPendingUserQuestion, queuePaused, queuedMessages, runPhase, setQueuedMessages, steerChatRun])

  useEffect(() => {
    if (
      isSubmitBlocked
      || queuePaused
      || editingQueue
      || queuedMessages.length === 0
      || queuedMessages[0].status === 'inserting'
    ) {
      return
    }
    const queueScopeChanged = previousQueueKeyRef.current !== queueKey
    if (queueScopeChanged) {
      queueFlushingRef.current = false
    } else if (queueFlushingRef.current) {
      return
    }
    if (queueTimerRef.current) {
      window.clearTimeout(queueTimerRef.current)
    }
    const scheduledQueueKey = queueKey
    queueTimerRef.current = window.setTimeout(() => {
      const latestState = useChatStore.getState()
      if (isSubmissionBlocked(latestState.runPhase, latestState.postRunJobs)) {
        return
      }
      const nextItem = selectQueuedPayloadForFlush({
        owners: useChatInputQueueStore.getState().owners,
        scheduledQueueKey,
        activeQueueKey: activeQueueKeyRef.current
      })
      if (!nextItem) {
        return
      }
      queueFlushingRef.current = true
      useChatInputQueueStore.getState().setMessages(queueScope, [])
      submitMessage(nextItem)
    }, 200)
    return () => {
      if (queueTimerRef.current) {
        window.clearTimeout(queueTimerRef.current)
        queueTimerRef.current = null
      }
    }
  }, [
    isSubmitBlocked,
    queuePaused,
    editingQueue,
    queueKey,
    queueScope,
    queuedMessages.length,
    queuedMessages[0]?.status,
    submitMessage
  ])

  useEffect(() => {
    if (!isSubmitBlocked) {
      queueFlushingRef.current = false
    }
  }, [isSubmitBlocked])

  useEffect(() => {
    if (isSubmitBlocked) {
      return
    }
    const lastAssistant = [...messages].reverse().find(msg => msg.body.role === 'assistant')
    const hasError = (lastAssistant?.body?.segments || []).some(segment => (segment as any).type === 'error')
    if (hasError) {
      setQueuePaused(true)
    }
  }, [isSubmitBlocked, messages, setQueuePaused])

  useEffect(() => {
    if (previousQueueKeyRef.current === queueKey) {
      return
    }

    previousQueueKeyRef.current = queueKey
    queueFlushingRef.current = false
    setInputContent('')
    setImageSrcBase64List([])
  }, [queueKey, setImageSrcBase64List])

  useEffect(() => {
    const editingMessage = queueOwner.editingMessage
    if (!editingMessage) {
      return
    }

    setInputContent(editingMessage.text)
    setImageSrcBase64List(editingMessage.images)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      caretOverlayRef.current?.updateCaret()
    })
  }, [queueKey, queueOwner.editingMessage, setImageSrcBase64List])

  const startEditQueuedMessage = useCallback(() => {
    if (
      editingQueue
      || queuedMessages.length === 0
      || queuedMessages[0].status === 'inserting'
    ) {
      return
    }
    const first = useChatInputQueueStore.getState().beginEditing(queueScope)
    if (!first) {
      return
    }
    setInputContent(first.text || '')
    setImageSrcBase64List(first.images || [])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      caretOverlayRef.current?.updateCaret()
    })
  }, [editingQueue, queueScope, queuedMessages, setImageSrcBase64List])

  const removeFirstQueuedMessage = useCallback(() => {
    setQueuedMessages(prev => {
      const first = prev[0]
      if (!first || first.status === 'inserting') {
        return prev
      }
      return prev.slice(1)
    })
  }, [setQueuedMessages])

  const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputContent(value)

    // Delegate command detection to the hook
    handleCommandInputChange(value)
  }, [handleCommandInputChange])

  const onTextAreaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.nativeEvent.isComposing || isComposingRef.current)) {
      return
    }
    if (e.shiftKey && e.key === 'ArrowUp') {
      if (
        queuedMessages.length > 0
        && queuedMessages[0].status === 'queued'
        && !editingQueue
      ) {
        e.preventDefault()
        startEditQueuedMessage()
        return
      }
    }

    // Delegate command palette navigation to the hook
    const handled = handleCommandKeyDown(e)
    if (handled) return

    // Handle Enter for submit, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasPendingUserQuestion) {
        toast.info('Answer the pending question to continue')
        return
      }
      if (!inputContent.trim()) {
        toast.error('Input text content is required')
        return
      }
      if (!ensureSelectedModelRef()) {
        toast.error('Please select a model')
        return
      }
      onSubmitClick(e)
      return
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      const target = e.currentTarget
      const currentValue = target.value
      const start = target.selectionStart ?? currentValue.length
      const end = target.selectionEnd ?? currentValue.length
      const nextValue = `${currentValue.slice(0, start)}\n${currentValue.slice(end)}`
      setInputContent(nextValue)
      handleCommandInputChange(nextValue)
      requestAnimationFrame(() => {
        const nextPos = start + 1
        target.selectionStart = nextPos
        target.selectionEnd = nextPos
        target.scrollTop = target.scrollHeight
        caretOverlayRef.current?.updateCaret(true)
      })
    }
  }, [
    handleCommandKeyDown,
    onSubmitClick,
    inputContent,
    selectedModelRef,
    ensureSelectedModelRef,
    queuedMessages.length,
    editingQueue,
    startEditQueuedMessage,
    hasPendingUserQuestion
  ])

  const onTextAreaCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const onTextAreaCompositionEnd = useCallback(() => {
    isComposingRef.current = false
  }, [])

  const onTextAreaPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = (event.clipboardData || (event as any).originalEvent.clipboardData).items
    let blob: File | null = null

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        // found image from clipboard
        blob = items[i].getAsFile()
        break
      }
    }
    if (blob) {
      const reader = new FileReader()
      reader.readAsDataURL(blob)
      reader.onloadend = () => {
        setImageSrcBase64List([...imageSrcBase64List, reader.result as string])
      }
    }
  }, [imageSrcBase64List, setImageSrcBase64List])

  const onTextAreaBlur = useCallback(() => {
    // Delegate blur handling to the hook
    handleCommandBlur()
  }, [handleCommandBlur])

  // Handle drag and drop events
  const onDragEnter = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const onDrop = useCallback(async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)

    // Get the first file/folder path and set as workspace
    if (files.length > 0) {
      try {
        const fullPath = window.electron.webUtils.getPathForFile(files[0])
        // console.log('[ChatInputArea] Dropped file/folder full path:', fullPath)

        // Check if the path is a directory
        const checkResult = await invokeCheckIsDirectory(fullPath)
        if (!checkResult.success || !checkResult.isDirectory) {
          toast.warning('Please drop a folder, not a file')
          return
        }

        // Set workspace path to trigger ChatInputActions
        setWorkspacePathToSelect(fullPath)

        // Reset after a short delay to allow re-triggering
        setTimeout(() => setWorkspacePathToSelect(null), 100)
      } catch (error) {
        // console.error('[ChatInputArea] Failed to get file path:', error)
        toast.error('Failed to process dropped item')
      }
    }
  }, [])

  const firstQueuedMessage = queuedMessages[0]
  const queuedMessageRail = firstQueuedMessage ? (
    <QueuedMessageRail
      message={firstQueuedMessage}
      remainingCount={Math.max(0, queuedMessages.length - 1)}
      paused={queuePaused}
      canInsert={
        !editingQueue
        && !hasPendingUserQuestion
        && (runPhase === 'submitting' || runPhase === 'streaming')
      }
      onInsert={() => {
        void insertQueuedMessage()
      }}
      onEdit={startEditQueuedMessage}
      onRemove={removeFirstQueuedMessage}
    />
  ) : null

  if (welcomeVisualMode) {
    return (
      <div
        ref={rootRef}
        id='inputArea'
        data-expanded={isWelcomeExpanded ? 'true' : 'false'}
        className="shared-prompt-welcome-frame rounded-md bg-transparent"
        onFocusCapture={() => updateWelcomeFocus(true)}
        onBlurCapture={event => {
          const nextFocusTarget = event.relatedTarget
          if (nextFocusTarget instanceof Node && event.currentTarget.contains(nextFocusTarget)) {
            return
          }

          updateWelcomeFocus(false)
        }}
      >
        <SharedPromptSurface
          ref={textareaRef}
          surfaceRef={setInputAreaContentRef}
          expanded={isWelcomeExpanded}
          className={cn(isSubmitBlocked && 'opacity-[0.82]')}
          textareaClassName="caret-transparent"
          isDragging={isDragging}
          value={inputContent}
          placeholder={hasPendingUserQuestion ? 'Answer the question above to continue' : 'Ask @i what to work on...'}
          onChange={onTextAreaChange}
          onKeyDown={onTextAreaKeyDown}
          onCompositionStart={onTextAreaCompositionStart}
          onCompositionEnd={onTextAreaCompositionEnd}
          onPaste={onTextAreaPaste}
          onBlur={onTextAreaBlur}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          topAccessory={queuedMessageRail}
          mediaGallery={imageSrcBase64List.length !== 0 ? <ChatImageGallery /> : null}
          bodyOverlay={(
            <CustomCaretOverlay
              ref={caretOverlayRef}
              textareaRef={textareaRef}
            />
          )}
          dropIndicator={isDragging ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/15 backdrop-blur-[1px]">
              <span className="rounded-full bg-background/82 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur-md">
                Drop a folder to set workspace
              </span>
            </div>
          ) : null}
          leftActions={(
            <ChatInputToolbar
              variant="baseline"
              selectedModel={selectedModel}
              modelOptions={modelOptions}
              plugins={plugins}
              selectedThinkingLevel={selectedThinkingLevel}
              permissionApprovalMode={permissionApprovalMode}
              modelMenuCollisionBoundary={modelMenuCollisionBoundary}
              setSelectedModelRef={setSelectedModelRef}
              setSelectedThinkingLevel={setSelectedThinkingLevel}
              setPermissionApprovalMode={setPermissionApprovalMode}
              onNewChat={startNewChat}
              onBaselineInteractionStart={holdWelcomeInteraction}
              onBaselinePopoverOpenChange={open => {
                setIsWelcomePopoverOpen(open)
                if (open) {
                  holdWelcomeInteraction()
                  return
                }

                releaseWelcomeInteraction()
              }}
            />
          )}
          rightActions={(
            <ChatInputActions
              variant="baseline"
              runPhase={runPhase}
              onNewChat={startNewChat}
              onSubmit={onSubmitClick}
              onCancel={cancelChatSubmit}
              workspacePathToSelect={workspacePathToSelect}
              submitDisabled={!inputContent.trim() || hasPendingUserQuestion}
            />
          )}
        />

        <CommandPalette
          isOpen={commandPanelOpen}
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          textareaRef={textareaRef}
          onCommandClick={executeCommand}
        />
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      id='inputArea'
      className="h-full w-full rounded-md bg-transparent"
    >
      <div
        id="inputAreaContent"
        className="relative flex h-full flex-col overflow-hidden bg-transparent px-2 py-1"
      >
        <div
          className={cn(
            'chat-input-card relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-3xl transition-opacity duration-200 ease-out',
            isSubmitBlocked && 'opacity-80'
          )}
        >
          <div className="min-h-[112px] min-w-0 flex-auto overflow-hidden">
            <SharedPromptSurface
              ref={textareaRef}
              surfaceRef={setInputAreaContentRef}
              variant="chat"
              expanded
              className={cn(isSubmitBlocked && 'opacity-[0.82]')}
              bodyClassName="min-h-0"
              textareaClassName={cn(
                'caret-transparent overflow-y-auto text-sm font-medium leading-6',
                'px-4 pb-3 pt-3 text-gray-700 dark:text-gray-300',
                'placeholder:text-gray-400/80 dark:placeholder:text-gray-500/80',
                isDragging && 'bg-gray-100/40 dark:bg-gray-700/25'
              )}
              isDragging={isDragging}
              value={inputContent}
              placeholder={hasPendingUserQuestion ? 'Draft stays here while the question is pending' : 'Type anything to chat'}
              onChange={onTextAreaChange}
              onKeyDown={onTextAreaKeyDown}
              onCompositionStart={onTextAreaCompositionStart}
              onCompositionEnd={onTextAreaCompositionEnd}
              onPaste={onTextAreaPaste}
              onBlur={onTextAreaBlur}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              topAccessory={queuedMessageRail}
              mediaGallery={imageSrcBase64List.length !== 0 ? <ChatImageGallery /> : null}
              dropIndicator={isDragging ? (
                <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-background/18 backdrop-blur-[2px]">
                  <div className="rounded-2xl border border-border/60 bg-background/90 px-5 py-3 text-sm font-medium text-muted-foreground shadow-lg backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                    Drop folder to set workspace
                  </div>
                </div>
              ) : null}
              bodyOverlay={(
                <CustomCaretOverlay
                  ref={caretOverlayRef}
                  textareaRef={textareaRef}
                />
              )}
              leftActions={(
                <ChatInputToolbar
                  variant="surface"
                  selectedModel={selectedModel}
                  modelOptions={modelOptions}
                  plugins={plugins}
                  selectedThinkingLevel={selectedThinkingLevel}
                  permissionApprovalMode={permissionApprovalMode}
                  modelMenuCollisionBoundary={modelMenuCollisionBoundary}
                  setSelectedModelRef={setSelectedModelRef}
                  setSelectedThinkingLevel={setSelectedThinkingLevel}
                  setPermissionApprovalMode={setPermissionApprovalMode}
                  onNewChat={startNewChat}
                />
              )}
              rightActions={(
                <ChatInputActions
                  variant="surface"
                  runPhase={runPhase}
                  onNewChat={startNewChat}
                  onSubmit={onSubmitClick}
                  onCancel={cancelChatSubmit}
                  workspacePathToSelect={workspacePathToSelect}
                  submitDisabled={!inputContent.trim() || hasPendingUserQuestion}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPanelOpen}
        commands={filteredCommands}
        selectedIndex={selectedCommandIndex}
        textareaRef={textareaRef}
        onCommandClick={executeCommand}
      />
    </div>
  )
})

export default ChatInputArea
