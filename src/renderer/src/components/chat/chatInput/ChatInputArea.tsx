import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { Textarea } from '@renderer/components/ui/textarea'
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
import { ChatInputToolConfirmation } from './ChatInputToolConfirmation'
import { invokeCheckIsDirectory } from '@renderer/invoker/ipcInvoker'
import { ArrowBigUp, ArrowUp, CornerDownLeft } from 'lucide-react'
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
  const setSelectedModelRef = useChatStore(state => state.setSelectedModelRef)
  const setSelectedThinkingLevel = useChatStore(state => state.setSelectedThinkingLevel)
  const ensureSelectedModelRef = useChatStore(state => state.ensureSelectedModelRef)
  const editUserInstructionDraft = useChatStore(state => state.editUserInstructionDraft)

  const {
    defaultModel,
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
    return resolveModelRef(selectedModelRef ?? defaultModel)
  }, [defaultModel, providersRevision, resolveModelRef, selectedModelRef])
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
  }, [ensureSelectedModelRef, selectedModel, modelOptions.length, defaultModel])

  // Use MCP connection hook
  const {
    selectedServers: selectedMcpServerNames,
    toggle: toggleMcpConnection,
    isConnecting: isConnectingMcpServer,
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

  useEffect(() => {
    if (welcomeVisualMode) {
      return
    }

    updateWelcomeFocus(false)
  }, [updateWelcomeFocus, welcomeVisualMode])

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
        data-welcome-focused={isWelcomeFocused ? 'true' : 'false'}
        className="welcome-chat-input-area rounded-md w-full h-full flex flex-col bg-transparent"
        onFocusCapture={() => updateWelcomeFocus(true)}
        onBlurCapture={event => {
          const nextFocusTarget = event.relatedTarget
          if (nextFocusTarget instanceof Node && event.currentTarget.contains(nextFocusTarget)) {
            return
          }

          updateWelcomeFocus(false)
        }}
      >
        <div
          ref={setInputAreaContentRef}
          id="inputAreaContent"
          className={cn(
            'welcome-light-input-shell welcome-prompt-surface relative overflow-hidden',
            isSubmitBlocked && 'opacity-[0.82]'
          )}
        >
          <div className="welcome-light-input-main welcome-prompt-body relative min-h-0 overflow-hidden">
            {imageSrcBase64List.length !== 0 && (
              <div className="welcome-light-input-gallery">
                <ChatImgGalleryComponent />
              </div>
            )}

            {isDragging && (
              <div className="welcome-light-drop-indicator pointer-events-none absolute inset-0 z-10 grid place-items-center">
                <span className="rounded-full bg-background/82 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur-md">
                  Drop a folder to set workspace
                </span>
              </div>
            )}

            <Textarea
              ref={textareaRef}
              className={cn(
                'welcome-light-textarea h-full w-full resize-none border-0 bg-transparent',
                'px-5 pb-3 pt-3 text-[15px] font-medium leading-6 text-foreground shadow-none',
                'placeholder:text-muted-foreground/56 focus-visible:ring-0 focus-visible:ring-offset-0',
                'focus-visible:outline-hidden'
              )}
              placeholder="Ask @i what to work on..."
              value={inputContent}
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
            />
          </div>

          <div className="welcome-light-input-details min-h-0 overflow-hidden">
            <div className="welcome-prompt-baseline flex items-center justify-between gap-3 px-4 pb-2.5 text-[11px] font-medium text-muted-foreground/66">
              <div className="welcome-prompt-baseline-start flex min-w-0 items-center gap-2">
                <span className="welcome-prompt-shortcut">Enter sends</span>
                <span className="welcome-prompt-divider" aria-hidden="true" />
                <span className="welcome-prompt-shortcut hidden sm:inline">Shift + Enter adds a line</span>
              </div>
              <div className="welcome-prompt-baseline-end flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Send message"
                  disabled={!inputContent.trim()}
                  className={cn(
                    'welcome-light-send-button welcome-prompt-send-button grid size-7 place-items-center',
                    'rounded-full border-0 bg-foreground text-background shadow-none',
                    'transition-[opacity,transform,background-color] duration-180 ease-(--welcome-input-ease)',
                    'hover:bg-foreground/88 active:scale-[0.96]',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/28',
                    !inputContent.trim() && 'pointer-events-none opacity-[0.22]'
                  )}
                  onClick={event => onSubmitClick(event)}
                >
                  <ArrowUp className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

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
      data-welcome-focused={isWelcomeFocused ? 'true' : 'false'}
      className={cn(
        'rounded-md w-full h-full flex flex-col bg-transparent',
        welcomeVisualMode && 'welcome-chat-input-area'
      )}
      onFocusCapture={() => {
        if (welcomeVisualMode) {
          updateWelcomeFocus(true)
        }
      }}
      onBlurCapture={event => {
        if (!welcomeVisualMode) {
          return
        }

        const nextFocusTarget = event.relatedTarget
        if (nextFocusTarget instanceof Node && event.currentTarget.contains(nextFocusTarget)) {
          return
        }

        updateWelcomeFocus(false)
      }}
    >
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
        <ChatImgGalleryComponent />
      </div>

      <div
        ref={setInputAreaContentRef}
        id="inputAreaContent"
        className={cn(
          'relative flex flex-col px-2 flex-1 overflow-hidden bg-transparent',
          welcomeVisualMode && 'welcome-chat-input-content'
        )}
      >
        <div
          className={cn(
            'chat-input-card relative flex flex-col flex-1 overflow-hidden transition-opacity duration-200 ease-out bg-transparent',
            isSubmitBlocked && 'opacity-80'
          )}
        >
          <ChatInputToolConfirmation />

          <ChatInputToolbar
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            plugins={plugins}
            selectedThinkingLevel={selectedThinkingLevel}
            modelMenuCollisionBoundary={modelMenuCollisionBoundary}
            setSelectedModelRef={setSelectedModelRef}
            setSelectedThinkingLevel={setSelectedThinkingLevel}
            selectedMcpServerNames={selectedMcpServerNames}
            mcpServerConfig={mcpServerConfig}
            toggleMcpConnection={toggleMcpConnection}
            isConnectingMcpServer={isConnectingMcpServer}
            queuedFirstText={queuedMessages[0]?.text}
            queuedCount={queuedMessages.length > 0 ? queuedMessages.length : undefined}
            queuePaused={queuePaused}
          />

          <div className="relative flex-1 overflow-hidden">
            {/* Drag overlay indicator */}
            {isDragging && (
              <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-gray-900/5 dark:bg-gray-100/5 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-white/90 dark:bg-gray-800/90 border border-gray-300 dark:border-gray-600 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-medium">Drop folder to set workspace</span>
                  </div>
                </div>
              </div>
            )}

            {!inputContent && (
              <div
                className={cn(
                  'absolute inset-0 z-10 pointer-events-none px-2 pt-0.5 pb-2',
                  'text-gray-400 dark:text-gray-500',
                  'select-none'
                )}
              >
                <div className="text-sm font-medium leading-relaxed">
                  Type anything to chat
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs font-medium">
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 px-1.5 py-0.5">
                    <CornerDownLeft className="h-3 w-3" />
                    Enter
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">Send</span>
                  <span className="mx-1 text-gray-300 dark:text-gray-600">•</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 px-1.5 py-0.5">
                    <ArrowBigUp className="h-3 w-3" />
                    Shift
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 px-1.5 py-0.5">
                    <CornerDownLeft className="h-3 w-3" />
                    Enter
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">New line</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs font-medium">
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 px-1.5 py-0.5">
                    <ArrowBigUp className="h-3 w-3" />
                    Shift
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-800/60 px-1.5 py-0.5">
                    ↑
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">Edit queued message</span>
                </div>
              </div>
            )}

            <Textarea
              ref={textareaRef}
              className={
                cn('bg-gray-50 dark:bg-gray-800 focus:bg-white/50 dark:focus:bg-gray-700/50 transition-all duration-300 ease-out',
                  'rounded-none resize-none overflow-y-auto text-sm px-2 pt-0.5 pb-2 font-medium text-gray-700 dark:text-gray-300 caret-transparent w-full h-full border-0 border-l border-r border-blue-gray-200 dark:border-gray-700',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500 leading-tight',
                  isDragging && 'bg-gray-100/80 dark:bg-gray-700/80 shadow-inner'
                )
              }
              placeholder=""
              value={inputContent}
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
            />

            <CustomCaretOverlay
              ref={caretOverlayRef}
              textareaRef={textareaRef}
            />
          </div>
        </div>

        <ChatInputActions
          artifacts={artifacts}
          runPhase={runPhase}
          toggleArtifacts={toggleArtifacts}
          setArtifactsPanel={setArtifactsPanel}
          onNewChat={startNewChat}
          onSubmit={onSubmitClick}
          onCancel={cancelChatSubmit}
          workspacePathToSelect={workspacePathToSelect}
        />
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
