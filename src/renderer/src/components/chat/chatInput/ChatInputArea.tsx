import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import useChatRun from '@renderer/hooks/useChatRun'
import { useSlashCommands } from '@renderer/hooks/useSlashCommands'
import { useMcpConnection } from '@renderer/hooks/useMcpConnection'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store/chatStore'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { useAssistantStore } from '@renderer/store/assistant'
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
import { invokeCheckIsDirectory } from '@renderer/invoker/ipcInvoker'
import {
  isSubmissionBlocked,
  mergeQueuedMessages,
  shouldQueueSubmission as getShouldQueueSubmission,
  type QueuedChatMessage
} from './queuePolicy'

interface ChatInputAreaProps {
  onMessagesUpdate?: () => void
  welcomeVisualMode?: boolean
  onWelcomeFocusStateChange?: (focused: boolean) => void
}

export interface ChatInputAreaHandle {
  fillInput: (text: string) => void
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
  const currentChatId = useChatStore(state => state.currentChatId)
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const artifacts = useChatStore(state => state.artifacts)
  const toggleArtifacts = useChatStore(state => state.toggleArtifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const selectedThinkingLevel = useChatStore(state => state.selectedThinkingLevel)
  const permissionApprovalMode = useChatStore(state => state.permissionApprovalMode)
  const setSelectedModelRef = useChatStore(state => state.setSelectedModelRef)
  const setSelectedThinkingLevel = useChatStore(state => state.setSelectedThinkingLevel)
  const setPermissionApprovalMode = useChatStore(state => state.setPermissionApprovalMode)
  const ensureSelectedModelRef = useChatStore(state => state.ensureSelectedModelRef)
  const editUserInstructionDraft = useChatStore(state => state.editUserInstructionDraft)

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

  // Get currentAssistant from assistant store
  const { currentAssistant } = useAssistantStore()

  const [inputContent, setInputContent] = useState<string>('')
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([])
  const [queuePaused, setQueuePaused] = useState<boolean>(false)
  const [editingQueue, setEditingQueue] = useState<boolean>(false)
  const [currentUserInstruction, setCurrentUserInstruction] = useState<string>('')
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [workspacePathToSelect, setWorkspacePathToSelect] = useState<string | null>(null)
  const [modelMenuCollisionBoundary, setModelMenuCollisionBoundary] = useState<HTMLElement | null>(null)
  const [isWelcomeFocused, setIsWelcomeFocused] = useState<boolean>(false)
  const [isWelcomePopoverOpen, setIsWelcomePopoverOpen] = useState<boolean>(false)
  const [isWelcomeInteractionHeld, setIsWelcomeInteractionHeld] = useState<boolean>(false)

  // Apply currentAssistant's systemPrompt to the request-level user instruction
  useEffect(() => {
    if (currentAssistant?.systemPrompt) {
      setCurrentUserInstruction(currentAssistant.systemPrompt)
    }
  }, [currentAssistant])

  // Textarea ref
  const rootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Custom Caret Ref
  const caretOverlayRef = useRef<CustomCaretRef>(null)
  const queueTimerRef = useRef<number | null>(null)
  const welcomeInteractionReleaseTimerRef = useRef<number | null>(null)
  const queueFlushingRef = useRef(false)
  const isComposingRef = useRef(false)
  const editingQueueRef = useRef<QueuedChatMessage | null>(null)

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
    startNewChatBase()
    setCurrentUserInstruction('')
    editUserInstructionDraft('')
    setQueuedMessages([])
    setQueuePaused(false)
    setEditingQueue(false)
    editingQueueRef.current = null
  }, [startNewChatBase, editUserInstructionDraft])

  const { onSubmit: handleChatSubmit, cancel: cancelChatSubmit } = useChatRun()
  const handleChatSubmitCallback = useCallback((text, img, options) => {
    handleChatSubmit(text, img, options)
  }, [handleChatSubmit])
  const submitMessage = useCallback((payload: QueuedChatMessage) => {
    onMessagesUpdate?.()
    const thinking = toUnifiedRequestThinkingOption(effectiveThinkingLevel)
    handleChatSubmitCallback(payload.text, payload.images, {
      userInstruction: payload.userInstruction,
      options: thinking ? { thinking } : undefined
    })
  }, [effectiveThinkingLevel, handleChatSubmitCallback, onMessagesUpdate])

  const enqueueMessage = useCallback((payload: QueuedChatMessage) => {
    if (queuedMessages.length >= 5) {
      toast.warning('Queue is full (max 5)')
      return
    }
    setQueuedMessages(prev => [...prev, payload])
    setInputContent('')
    setImageSrcBase64List([])

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = ''
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }))
        caretOverlayRef.current?.updateCaret()
      }
    })
  }, [queuedMessages.length, queuePaused, setImageSrcBase64List])

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
    const activeModelRef = ensureSelectedModelRef()
    if (!activeModelRef) {
      toast.warning('Please select a model')
      return
    }

    // 中断打字机效果（如果正在执行）
    const forceComplete = useChatStore.getState().forceCompleteTypewriter
    if (forceComplete) {
      forceComplete()
    }

    setQueuePaused(false)

    const payload = {
      text: trimmedInput,
      images: imageSrcBase64List,
      userInstruction: currentUserInstruction
    }

    if (editingQueue) {
      const editedPayload = {
        text: trimmedInput,
        images: imageSrcBase64List,
        userInstruction: editingQueueRef.current?.userInstruction ?? currentUserInstruction
      }

      setEditingQueue(false)
      editingQueueRef.current = null
      setInputContent('')
      setImageSrcBase64List([])

      if (shouldQueueSubmission) {
        setQueuedMessages(prev => [editedPayload, ...prev])
        return
      }

      submitMessage(editedPayload)
      return
    }

    if (shouldQueueSubmission) {
      enqueueMessage(payload)
      return
    }

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
    currentUserInstruction,
    queuePaused,
    editingQueue,
    queuedMessages.length,
    shouldQueueSubmission,
    enqueueMessage,
    submitMessage,
    setImageSrcBase64List
  ])

  useEffect(() => {
    if (isSubmitBlocked || queuePaused || editingQueue || queuedMessages.length === 0) {
      return
    }
    if (queueFlushingRef.current) {
      return
    }
    if (queueTimerRef.current) {
      window.clearTimeout(queueTimerRef.current)
    }
    queueTimerRef.current = window.setTimeout(() => {
      const latestState = useChatStore.getState()
      if (isSubmissionBlocked(latestState.runPhase, latestState.postRunJobs)) {
        return
      }
      setQueuedMessages(prev => {
        if (prev.length === 0) {
          return prev
        }
        const nextItem = mergeQueuedMessages(prev)
        if (!nextItem) {
          return prev
        }
        queueFlushingRef.current = true
        submitMessage(nextItem)
        return []
      })
    }, 200)
    return () => {
      if (queueTimerRef.current) {
        window.clearTimeout(queueTimerRef.current)
        queueTimerRef.current = null
      }
    }
  }, [isSubmitBlocked, queuePaused, editingQueue, queuedMessages.length, submitMessage])

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
  }, [messages, isSubmitBlocked])

  useEffect(() => {
    setQueuedMessages([])
    setQueuePaused(false)
    setEditingQueue(false)
    editingQueueRef.current = null
  }, [currentChatId, currentChatUuid])

  const startEditQueuedMessage = useCallback(() => {
    if (editingQueue || queuedMessages.length === 0) {
      return
    }
    const [first, ...rest] = queuedMessages
    editingQueueRef.current = first
    setEditingQueue(true)
    setQueuedMessages(rest)
    setInputContent(first.text || '')
    setImageSrcBase64List(first.images || [])
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      caretOverlayRef.current?.updateCaret()
    })
  }, [editingQueue, queuedMessages, setImageSrcBase64List])

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
      if (queuedMessages.length > 0 && !editingQueue) {
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
  }, [handleCommandKeyDown, onSubmitClick, inputContent, selectedModelRef, ensureSelectedModelRef, queuedMessages.length, editingQueue, startEditQueuedMessage])

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
          isDragging={isDragging}
          value={inputContent}
          placeholder="Ask @i what to work on..."
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
          mediaGallery={imageSrcBase64List.length !== 0 ? <ChatImgGalleryComponent /> : null}
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
              queuedFirstText={queuedMessages[0]?.text}
              queuedCount={queuedMessages.length > 0 ? queuedMessages.length : undefined}
              queuePaused={queuePaused}
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
              artifacts={artifacts}
              runPhase={runPhase}
              toggleArtifacts={toggleArtifacts}
              setArtifactsPanel={setArtifactsPanel}
              onNewChat={startNewChat}
              onSubmit={onSubmitClick}
              onCancel={cancelChatSubmit}
              workspacePathToSelect={workspacePathToSelect}
              submitDisabled={!inputContent.trim()}
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
              placeholder="Type anything to chat"
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
              mediaGallery={imageSrcBase64List.length !== 0 ? <ChatImgGalleryComponent /> : null}
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
                  queuedFirstText={queuedMessages[0]?.text}
                  queuedCount={queuedMessages.length > 0 ? queuedMessages.length : undefined}
                  queuePaused={queuePaused}
                  onNewChat={startNewChat}
                />
              )}
              rightActions={(
                <ChatInputActions
                  variant="surface"
                  artifacts={artifacts}
                  runPhase={runPhase}
                  toggleArtifacts={toggleArtifacts}
                  setArtifactsPanel={setArtifactsPanel}
                  onNewChat={startNewChat}
                  onSubmit={onSubmitClick}
                  onCancel={cancelChatSubmit}
                  workspacePathToSelect={workspacePathToSelect}
                  submitDisabled={!inputContent.trim()}
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
