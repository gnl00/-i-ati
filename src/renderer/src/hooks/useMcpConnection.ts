import { useState, useCallback } from 'react'
import { useChatStore } from '@renderer/store'
import { invokeMcpConnect, invokeMcpDisconnect } from '@renderer/invoker/ipcInvoker'
import { embeddedToolsRegistry } from '@tools/registry'
import { toast } from 'sonner'

/**
 * Custom hook for managing MCP server connections
 * Handles connection state, tool registration, and store updates
 */
export const useMcpConnection = () => {
  // Local state for tracking connecting servers (temporary UI state)
  const [connectingServers, setConnectingServers] = useState<Set<string>>(new Set())

  // Store selectors
  const selectedMcpServerNames = useChatStore(state => state.selectedMcpServerNames)
  const addSelectedMcpServer = useChatStore(state => state.addSelectedMcpServer)
  const removeSelectedMcpServer = useChatStore(state => state.removeSelectedMcpServer)
  const addMcpTools = useChatStore(state => state.addMcpTools)
  const removeMcpTools = useChatStore(state => state.removeMcpTools)
  const getMcpTools = useChatStore(state => state.getMcpTools)

  /**
   * Check if a server is currently connecting
   */
  const isConnecting = useCallback((serverName: string): boolean => {
    return connectingServers.has(serverName)
  }, [connectingServers])

  /**
   * Check if a server is connected
   */
  const isConnected = useCallback((serverName: string): boolean => {
    return selectedMcpServerNames.includes(serverName)
  }, [selectedMcpServerNames])

  /**
   * Connect to an MCP server
   */
  const connect = useCallback(async (serverName: string, serverConfig: any) => {
    // Add to connecting set
    setConnectingServers(prev => new Set(prev).add(serverName))

    try {
      const { result, tools, msg } = await invokeMcpConnect({
        name: serverName,
        ...serverConfig
      })

      if (result) {
        // Update store
        addSelectedMcpServer(serverName)
        addMcpTools(serverName, tools)

        // Register tools in the registry
        tools.forEach((tool: any) => {
          embeddedToolsRegistry.registerExternal(tool.name, {
            type: 'function',
            function: tool
          })
        })

        toast.success(msg)
        return { success: true, tools }
      } else {
        toast.error(msg)
        return { success: false, error: msg }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to connect: ${errorMsg}`)
      return { success: false, error: errorMsg }
    } finally {
      // Remove from connecting set
      setConnectingServers(prev => {
        const newSet = new Set(prev)
        newSet.delete(serverName)
        return newSet
      })
    }
  }, [addSelectedMcpServer, addMcpTools])

  /**
   * Disconnect from an MCP server
   */
  const disconnect = useCallback(async (serverName: string) => {
    try {
      // Unregister tools from the registry
      const tools = getMcpTools(serverName)
      if (tools) {
        tools.forEach((tool: any) => {
          embeddedToolsRegistry.unregisterExternal(tool.name)
        })
      }

      // Update store
      removeSelectedMcpServer(serverName)
      removeMcpTools(serverName)

      // Disconnect from server
      await invokeMcpDisconnect({ name: serverName })

      toast.warning(`Disconnected mcp-server '${serverName}'`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to disconnect: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }, [removeSelectedMcpServer, removeMcpTools, getMcpTools])

  /**
   * Toggle connection to an MCP server
   */
  const toggle = useCallback(async (serverName: string, serverConfig: any) => {
    if (isConnected(serverName)) {
      return await disconnect(serverName)
    } else {
      return await connect(serverName, serverConfig)
    }
  }, [isConnected, connect, disconnect])

  return {
    // State
    connectingServers: Array.from(connectingServers),
    selectedServers: selectedMcpServerNames,

    // Methods
    connect,
    disconnect,
    toggle,
    isConnecting,
    isConnected,
  }
}
