import { useCallback, useMemo } from 'react'
import { useChatStore } from '@renderer/store'
import { useChatContext } from '@renderer/context/ChatContext'

export interface SlashCommand {
  cmd: string
  label: string
  description: string
  action: () => void
}

/**
 * Custom hook for managing slash commands in the chat input
 * Provides a centralized place for command definitions and their actions
 */
export const useSlashCommands = () => {
  const { setChatId, setChatUuid, setChatTitle } = useChatContext()
  const setMessages = useChatStore(state => state.setMessages)
  const artifacts = useChatStore(state => state.artifacts)
  const toggleArtifacts = useChatStore(state => state.toggleArtifacts)
  const setArtifactsPanel = useChatStore(state => state.setArtifactsPanel)
  const webSearchEnable = useChatStore(state => state.webSearchEnable)
  const toggleWebSearch = useChatStore(state => state.toggleWebSearch)

  /**
   * Start a new chat session
   * Clears all messages and resets chat state
   */
  const startNewChat = useCallback(() => {
    setChatId(undefined)
    setChatUuid(undefined)
    setChatTitle('NewChat')
    setMessages([])
    toggleArtifacts(false)
    toggleWebSearch(false)
  }, [setChatId, setChatUuid, setChatTitle, setMessages, toggleArtifacts, toggleWebSearch])

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

  return {
    commands,
    startNewChat
  }
}
