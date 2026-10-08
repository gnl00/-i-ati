import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useChatStore } from '@renderer/features/chat/state/chatStore'
import { getDefaultWorkspacePath } from '@shared/workspace/workspacePaths'
import { parseStandaloneSkillCommand } from './skillCommand'

export interface SlashCommand {
  cmd: string
  label: string
  description: string
  active?: boolean
  action: () => void | boolean | Promise<void | boolean>
}

export interface UseSlashCommandsOptions {
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>
  onCommandExecute?: (command: SlashCommand) => void
  skillCommands?: SlashCommand[]
  onSkillCommandSubmit?: (raw: string) => boolean | Promise<boolean>
}

const EMPTY_SKILL_COMMANDS: SlashCommand[] = []

type SlashCommandsState = {
  commands: SlashCommand[]
  startNewChat: () => void
  isOpen: boolean
  query: string
  selectedIndex: number
  filteredCommands: SlashCommand[]
  executeCommand: (command: SlashCommand) => Promise<boolean>
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  handleInputChange: (value: string) => void
  handleBlur: () => void
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Custom hook for managing slash commands in the chat input
 * Provides a centralized place for command definitions and their actions
 * Also manages command palette state and keyboard navigation
 */
export const useSlashCommands = (options: UseSlashCommandsOptions = {}): SlashCommandsState => {
  const {
    onCommandExecute,
    skillCommands = EMPTY_SKILL_COMMANDS,
    onSkillCommandSubmit
  } = options
  const resetChatContext = useChatStore(state => state.resetChatContext)
  const toggleWebSearch = useChatStore(state => state.toggleWebSearch)
  const currentChatUuid = useChatStore(state => state.currentChatUuid)
  const updateWorkspacePath = useChatStore(state => state.updateWorkspacePath)

  // Command palette state
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef('')

  /**
   * Start a new chat session
   * Clears all messages and resets chat state
   */
  const startNewChat = useCallback(() => {
    resetChatContext()
    toggleWebSearch(false)
  }, [resetChatContext, toggleWebSearch])

  const clearWorkspace = useCallback(async () => {
    if (!currentChatUuid) {
      return
    }

    await updateWorkspacePath(getDefaultWorkspacePath(currentChatUuid))
  }, [currentChatUuid, updateWorkspacePath])

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
    ...(currentChatUuid
      ? [{
          cmd: '/clear-workspace',
          label: 'Clear Workspace',
          description: `Reset workspace to: ${getDefaultWorkspacePath(currentChatUuid)}`,
          action: clearWorkspace
        }]
      : []),
    ...skillCommands
  ], [startNewChat, clearWorkspace, currentChatUuid, skillCommands])

  /**
   * Filter commands based on query
   */
  const filteredCommands = useMemo(() => {
    if (!query) return commands
    if (query.startsWith('sk:')) {
      const exact = skillCommands.find(command => command.cmd === `/${query}`)
      if (exact) return [exact]
    }
    const lowerQuery = query.toLowerCase()
    return commands.filter(cmd =>
      cmd.cmd.toLowerCase().includes(lowerQuery) ||
      cmd.label.toLowerCase().includes(lowerQuery)
    )
  }, [commands, query, skillCommands])

  /**
   * Reset selected index when filtered commands change
   */
  useEffect(() => {
    const isUnmatchedSkill = query.startsWith('sk:')
      && !skillCommands.some(command => command.cmd === `/${query}`)
    setSelectedIndex(isUnmatchedSkill ? -1 : 0)
  }, [filteredCommands, query, skillCommands])

  /**
   * Execute a command and clean up
   */
  const executeCommand = useCallback(async (command: SlashCommand) => {
    const submittedInput = inputRef.current
    // Execute the command action
    if (await command.action() === false) {
      return false
    }
    if (inputRef.current !== submittedInput) return true

    // Call the optional callback
    if (onCommandExecute) {
      onCommandExecute(command)
    }

    // Close the palette
    setIsOpen(false)
    setQuery('')
    return true
  }, [onCommandExecute])

  const submitSkillCommand = useCallback(async (raw: string) => {
    const submittedInput = inputRef.current
    if (await onSkillCommandSubmit?.(raw) && inputRef.current === submittedInput) {
      setIsOpen(false)
      setQuery('')
    }
  }, [onSkillCommandSubmit])

  /**
   * Handle keyboard navigation in command palette
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return false

    if (e.key === 'ArrowDown') {
      if (filteredCommands.length === 0) return false
      e.preventDefault()
      setSelectedIndex(prev =>
        prev < filteredCommands.length - 1 ? prev + 1 : 0
      )
      return true
    }

    if (e.key === 'ArrowUp') {
      if (filteredCommands.length === 0) return false
      e.preventDefault()
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : filteredCommands.length - 1
      )
      return true
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      const selectedCommand = filteredCommands[selectedIndex]
      if (selectedCommand) {
        e.preventDefault()
        void executeCommand(selectedCommand)
        return true
      }
      if (query.startsWith('sk:') && onSkillCommandSubmit) {
        e.preventDefault()
        void submitSkillCommand(`/${query}`)
        return true
      }
      return false
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
      setQuery('')
      return true
    }

    return false
  }, [isOpen, filteredCommands, selectedIndex, executeCommand, query, onSkillCommandSubmit, submitSkillCommand])

  /**
   * Handle textarea input change to detect slash commands
   */
  const handleInputChange = useCallback((value: string) => {
    inputRef.current = value
    const skillName = parseStandaloneSkillCommand(value)
    if (skillName !== null) {
      setQuery(`sk:${skillName}`)
      setIsOpen(true)
      return
    }
    // Only process if starts with /
    if (value.startsWith('/') && !/[\r\n]/.test(value)) {
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
