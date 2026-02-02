import { useCallback, useMemo, useState, useEffect } from 'react'
import { useChatStore } from '@renderer/store'

export interface SlashCommand {
  cmd: string
  label: string
  description: string
  action: () => void
}

export interface UseSlashCommandsOptions {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  onCommandExecute?: (command: SlashCommand) => void
}

/**
 * Custom hook for managing slash commands in the chat input
 * Provides a centralized place for command definitions and their actions
 * Also manages command palette state and keyboard navigation
 */
export const useSlashCommands = (options: UseSlashCommandsOptions = {}) => {
  const { onCommandExecute } = options
  const setChatId = useChatStore(state => state.setChatId)
  const setChatUuid = useChatStore(state => state.setChatUuid)
  const setChatTitle = useChatStore(state => state.setChatTitle)
  const clearMessages = useChatStore(state => state.clearMessages)
  const artifacts = useChatStore(state => state.artifacts)
  const toggleArtifacts = useChatStore(state => state.toggleArtifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const webSearchEnable = useChatStore(state => state.webSearchEnable)
  const toggleWebSearch = useChatStore(state => state.toggleWebSearch)

  // Command palette state
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  /**
   * Start a new chat session
   * Clears all messages and resets chat state
   */
  const startNewChat = useCallback(() => {
    setChatId(null)
    setChatUuid(null)
    setChatTitle('NewChat')
    clearMessages()
    toggleArtifacts(false)
    toggleWebSearch(false)
  }, [setChatId, setChatUuid, setChatTitle, clearMessages, toggleArtifacts, toggleWebSearch])

  /**
   * Available slash commands
   * Commands are memoized to avoid recreation on every render
   */
  const commands = useMemo<SlashCommand[]>(() => [
    {
      cmd: '/clear',
      label: 'Clear Chat',
      description: 'Clear current chat and start a new chat',
      action: startNewChat
    },
    {
      cmd: '/artifacts',
      label: 'Toggle Artifacts',
      description: artifacts ? 'Expand Artifacts Panel' : 'Collapse Artifacts Panel',
      action: () => {
        const newState = !artifacts
        toggleArtifacts(newState)
        setArtifactsPanel(newState)
      }
    },
    {
      cmd: '/websearch',
      label: 'Toggle Web Search',
      description: webSearchEnable ? 'Disable Web Search' : 'Enable Web Search',
      action: () => toggleWebSearch(!webSearchEnable)
    },
  ], [artifacts, webSearchEnable, startNewChat, toggleArtifacts, setArtifactsPanel, toggleWebSearch])

  /**
   * Filter commands based on query
   */
  const filteredCommands = useMemo(() => {
    if (!query) return commands
    const lowerQuery = query.toLowerCase()
    return commands.filter(cmd =>
      cmd.cmd.toLowerCase().includes(lowerQuery) ||
      cmd.label.toLowerCase().includes(lowerQuery)
    )
  }, [commands, query])

  /**
   * Reset selected index when filtered commands change
   */
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredCommands])

  /**
   * Execute a command and clean up
   */
  const executeCommand = useCallback((command: SlashCommand) => {
    // Execute the command action
    command.action()

    // Call the optional callback
    if (onCommandExecute) {
      onCommandExecute(command)
    }

    // Close the palette
    setIsOpen(false)
    setQuery('')
  }, [onCommandExecute])

  /**
   * Handle keyboard navigation in command palette
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      )
      return true
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      )
      return true
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (filteredCommands.length > 0) {
        executeCommand(filteredCommands[selectedIndex])
      }
      return true
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setQuery('')
      return true
    }

    return false
  }, [isOpen, filteredCommands, selectedIndex, executeCommand])

  /**
   * Handle textarea input change to detect slash commands
   */
  const handleInputChange = useCallback((value: string) => {
    // Only process if starts with /
    if (value.startsWith('/')) {
      const spaceIndex = value.indexOf(' ')
      const commandQuery = spaceIndex === -1 ? value.slice(1) : value.slice(1, spaceIndex)

      if (spaceIndex === -1) {
        // Still typing command, show palette
        setQuery(commandQuery)
        setIsOpen(true)
      } else {
        // Space entered, close palette
        setIsOpen(false)
      }
    } else {
      // Not a command, close palette
      setIsOpen(false)
    }
  }, [])

  /**
   * Handle blur event with delay to allow click events
   */
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      setIsOpen(false)
    }, 200)
  }, [])

  return {
    commands,
    startNewChat,
    // Command palette state
    isOpen,
    query,
    selectedIndex,
    filteredCommands,
    // Command palette actions
    executeCommand,
    handleKeyDown,
    handleInputChange,
    handleBlur,
    setIsOpen
  }
}
