import ChatImgGalleryComponent from '@renderer/components/chat/ChatImgGalleryComponent'
import { Textarea } from '@renderer/components/ui/textarea'
import useChatSubmit from '@renderer/hooks/useChatSubmit'
import { useSlashCommands } from '@renderer/hooks/useSlashCommands'
import { useMcpConnection } from '@renderer/hooks/useMcpConnection'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/store'
import { useAppConfigStore } from '@renderer/store/appConfig'
import { embeddedToolsRegistry } from "@tools/registry"
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CustomCaretOverlay, CustomCaretRef } from '../common/CustomCaretOverlay'
import CommandPalette from './CommandPalette'
import ChatInputToolbar from './ChatInputToolbar'
import ChatInputActions from './ChatInputActions'

interface ChatInputAreaProps {
  onMessagesUpdate: () => void
  suggestedPrompt?: string  // 接收来自 WelcomeMessage 的建议（自动填充）
}

const ChatInputArea = React.forwardRef<HTMLDivElement, ChatInputAreaProps>(({
  onMessagesUpdate,
  suggestedPrompt,
}, ref) => {
  // Use Zustand selectors to avoid unnecessary re-renders
  // Only subscribe to specific state slices instead of the entire store
  const imageSrcBase64List = useChatStore(state => state.imageSrcBase64List)
  const setImageSrcBase64List = useChatStore(state => state.setImageSrcBase64List)
  const currentReqCtrl = useChatStore(state => state.currentReqCtrl)
  const readStreamState = useChatStore(state => state.readStreamState)
  const webSearchEnable = useChatStore(state => state.webSearchEnable)
  const artifacts = useChatStore(state => state.artifacts)
  const toggleArtifacts = useChatStore(state => state.toggleArtifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const selectedModelRef = useChatStore(state => state.selectedModelRef)
  const setSelectedModelRef = useChatStore(state => state.setSelectedModelRef)
  const getAllMcpTools = useChatStore(state => state.getAllMcpTools)

  const {
    accounts,
    providerDefinitions,
    resolveModelRef,
    mcpServerConfig,
  } = useAppConfigStore()

  const modelOptions = useMemo(() => {
    return accounts.flatMap(account =>
      account.models
        .filter(model => model.enabled !== false)
        .map(model => ({
          account,
          model,
          definition: providerDefinitions.find(def => def.id === account.providerId)
        }))
    )
  }, [accounts, providerDefinitions])

  const selectedModel = useMemo(() => {
    return resolveModelRef(selectedModelRef)
  }, [resolveModelRef, selectedModelRef, accounts, providerDefinitions])

  useEffect(() => {
    if (!selectedModelRef && modelOptions.length === 1) {
      const onlyOption = modelOptions[0]
      setSelectedModelRef({ accountId: onlyOption.account.id, modelId: onlyOption.model.id })
    }
  }, [modelOptions, selectedModelRef, setSelectedModelRef])

  // Use MCP connection hook
  const {
    selectedServers: selectedMcpServerNames,
    toggle: toggleMcpConnection,
    isConnecting: isConnectingMcpServer
  } = useMcpConnection()

  const [inputContent, setInputContent] = useState<string>('')
  const [chatTemperature, setChatTemperature] = useState<number[]>([1])
  const [chatTopP, setChatTopP] = useState<number[]>([1])
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>('')

  // Textarea ref
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Custom Caret Ref
  const caretOverlayRef = useRef<CustomCaretRef>(null)

  // Callback to handle command execution with textarea cleanup
  const handleCommandExecute = useCallback((command: any) => {
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

  // Extend startNewChat to include local state reset
  const startNewChat = useCallback(() => {
    startNewChatBase()
    setCurrentSystemPrompt('')
  }, [startNewChatBase])

  const { onSubmit: handleChatSubmit, cancel: cancelChatSubmit } = useChatSubmit()
  const handleChatSubmitCallback = useCallback((text, img, options) => {
    handleChatSubmit(text, img, options)
  }, [handleChatSubmit])
  const onSubmitClick = useCallback((_event?: React.MouseEvent | React.KeyboardEvent) => {
    if (!inputContent) {
      return
    }
    if (!selectedModelRef) {
      toast.warning('Please select a model')
      return
    }

    // 中断打字机效果（如果正在执行）
    const forceComplete = useChatStore.getState().forceCompleteTypewriter
    if (forceComplete) {
      forceComplete()
    }

    onMessagesUpdate() // for chat-window scroll to the end
    const tools = getAllMcpTools()
    if (webSearchEnable) {
      const f = embeddedToolsRegistry.getTool('web_search')
      if (f) {
        tools.push({
          ...f.function
        })
      }
    }
    handleChatSubmitCallback(inputContent, imageSrcBase64List, { tools: tools, prompt: currentSystemPrompt })
    setInputContent('')
    setImageSrcBase64List([])

    // Reset caret position after clearing input
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.value = '' // Ensure DOM is synced
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true })) // Trigger auto-resize if needed
        caretOverlayRef.current?.updateCaret()
      }
    })
  }, [
    inputContent,
    imageSrcBase64List,
    selectedModelRef,
    currentSystemPrompt,
    getAllMcpTools,
    webSearchEnable,
    onMessagesUpdate,
    setImageSrcBase64List,
    handleChatSubmitCallback
  ])

  const onTextAreaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setInputContent(value)

    // Delegate command detection to the hook
    handleCommandInputChange(value)
  }, [handleCommandInputChange])

  // 监听 suggestedPrompt 的变化（自动填充到 textarea）
  useEffect(() => {
    if (suggestedPrompt && suggestedPrompt !== inputContent) {
      setInputContent(suggestedPrompt)
      // 聚焦到 textarea 并将光标移到末尾
      setTimeout(() => {
        textareaRef.current?.focus()
        const length = textareaRef.current?.value.length || 0
        textareaRef.current?.setSelectionRange(length, length)
      }, 0)
    }
  }, [suggestedPrompt])

  const onTextAreaKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Delegate command palette navigation to the hook
    const handled = handleCommandKeyDown(e)
    if (handled) return

    // Handle Shift+Enter for submit
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      if (!inputContent) {
        toast.error('Input text content is required')
        return
      }
      if (!selectedModelRef) {
        toast.error('Please select a model')
        return
      }
      onSubmitClick(e)
    }
  }, [handleCommandKeyDown, onSubmitClick, inputContent, selectedModelRef])

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

  return (
    <div ref={ref} id='inputArea' className={cn('rounded-md w-full h-full flex flex-col')}>
      <div className={cn(imageSrcBase64List.length !== 0 ? 'h-28' : 'h-0')}>
        <ChatImgGalleryComponent />
      </div>

      <div id="inputArea" className='relative flex flex-col pb-2 px-2 flex-1 overflow-hidden'>
        <div
          className={cn(
            'relative flex flex-col flex-1 overflow-hidden transition-opacity duration-200 ease-out',
            readStreamState && 'opacity-60 grayscale pointer-events-none'
          )}
        >
          <ChatInputToolbar
            selectedModel={selectedModel}
            modelOptions={modelOptions}
            setSelectedModelRef={setSelectedModelRef}
            selectedMcpServerNames={selectedMcpServerNames}
            mcpServerConfig={mcpServerConfig}
            toggleMcpConnection={toggleMcpConnection}
            isConnectingMcpServer={isConnectingMcpServer}
            chatTemperature={chatTemperature}
            chatTopP={chatTopP}
            currentSystemPrompt={currentSystemPrompt}
            onTemperatureChange={setChatTemperature}
            onTopPChange={setChatTopP}
            onSystemPromptChange={setCurrentSystemPrompt}
          />

          <div className="relative flex-1 overflow-hidden">
            <Textarea
              ref={textareaRef}
              className={
                cn('bg-gray-50 dark:bg-gray-800 focus:bg-white/50 dark:focus:bg-gray-700/50 transition-colors duration-200 ease-out',
                  'rounded-none resize-none overflow-y-auto text-sm px-2 pt-0.5 pb-2 font-medium text-gray-700 dark:text-gray-300 caret-transparent w-full h-full border-0 border-l-[1px] border-r-[1px] border-blue-gray-200 dark:border-gray-700',
                  'placeholder:text-gray-400 dark:placeholder:text-gray-500 leading-relaxed',
                )
              }
              placeholder={readStreamState ? 'Processing...Wait a moment' : 'Type anything to chat'}
              value={inputContent}
              onChange={onTextAreaChange}
              onKeyDown={onTextAreaKeyDown}
              onPaste={onTextAreaPaste}
              onBlur={onTextAreaBlur}
              disabled={readStreamState}
            />

            <CustomCaretOverlay
              ref={caretOverlayRef}
              textareaRef={textareaRef}
            />
          </div>
        </div>

        <ChatInputActions
          artifacts={artifacts}
          currentReqCtrl={currentReqCtrl}
          toggleArtifacts={toggleArtifacts}
          setArtifactsPanel={setArtifactsPanel}
          onNewChat={startNewChat}
          onSubmit={onSubmitClick}
          onCancel={cancelChatSubmit}
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
