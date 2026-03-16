import { invokeMcpConnect, invokeMcpDisconnect, invokeMcpStatus } from '@renderer/invoker/ipcInvoker'
import { useMcpRuntimeStore } from '@renderer/store/mcpRuntime'
import { useCallback } from 'react'
import { toast } from 'sonner'

/**
 * MCP runtime hook.
 * Separates persisted MCP config from ephemeral connection/runtime state.
 */
export const useMcpConnection = () => {
  const selectedMcpServerNames = useMcpRuntimeStore(state => state.selectedServerNames)
  const connectingServerNames = useMcpRuntimeStore(state => state.connectingServerNames)
  const addSelectedMcpServer = useMcpRuntimeStore(state => state.addSelectedServer)
  const removeSelectedMcpServer = useMcpRuntimeStore(state => state.removeSelectedServer)
  const addMcpTools = useMcpRuntimeStore(state => state.addServerTools)
  const removeMcpTools = useMcpRuntimeStore(state => state.removeServerTools)
  const startConnecting = useMcpRuntimeStore(state => state.startConnecting)
  const finishConnecting = useMcpRuntimeStore(state => state.finishConnecting)
  const setServerError = useMcpRuntimeStore(state => state.setServerError)

  const isConnecting = useCallback((serverName: string): boolean => {
    return connectingServerNames.includes(serverName)
  }, [connectingServerNames])

  const isConnected = useCallback((serverName: string): boolean => {
    return selectedMcpServerNames.includes(serverName)
  }, [selectedMcpServerNames])

  const connect = useCallback(async (serverName: string, serverConfig: LocalMcpServerConfig) => {
    startConnecting(serverName)

    try {
      const { result, tools, msg } = await invokeMcpConnect({
        name: serverName,
        ...serverConfig
      })

      if (result) {
        addSelectedMcpServer(serverName)
        addMcpTools(serverName, tools)
        setServerError(serverName, undefined)
        toast.success(msg)
        return { success: true, tools }
      }

      setServerError(serverName, msg)
      toast.error(msg)
      return { success: false, error: msg }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setServerError(serverName, errorMsg)
      toast.error(`Failed to connect: ${errorMsg}`)
      return { success: false, error: errorMsg }
    } finally {
      finishConnecting(serverName)
    }
  }, [addMcpTools, addSelectedMcpServer, finishConnecting, setServerError, startConnecting])

  const disconnect = useCallback(async (serverName: string) => {
    try {
      removeSelectedMcpServer(serverName)
      removeMcpTools(serverName)
      setServerError(serverName, undefined)
      await invokeMcpDisconnect({ name: serverName })
      toast.warning(`Disconnected mcp-server '${serverName}'`)
      return { success: true }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setServerError(serverName, errorMsg)
      toast.error(`Failed to disconnect: ${errorMsg}`)
      return { success: false, error: errorMsg }
    }
  }, [removeMcpTools, removeSelectedMcpServer, setServerError])

  const toggle = useCallback(async (serverName: string, serverConfig: LocalMcpServerConfig) => {
    if (isConnected(serverName)) {
      return await disconnect(serverName)
    }
    return await connect(serverName, serverConfig)
  }, [connect, disconnect, isConnected])

  const syncWithConfig = useCallback(async (config: McpServerConfig) => {
    const validNames = Object.keys(config?.mcpServers || {})
    const validSet = new Set(validNames)
    const { pruneServers, selectedServerNames } = useMcpRuntimeStore.getState()
    const staleNames = selectedServerNames.filter(name => !validSet.has(name))

    pruneServers(validNames)

    await Promise.all(
      staleNames.map(async (serverName) => {
        try {
          await invokeMcpDisconnect({ name: serverName })
        } catch {
          // best effort cleanup
        }
      })
    )
  }, [])

  const hydrateFromRuntime = useCallback(async () => {
    const snapshot = await invokeMcpStatus()
    useMcpRuntimeStore.getState().hydrateFromSnapshot(snapshot)
    return snapshot
  }, [])

  return {
    connectingServers: connectingServerNames,
    selectedServers: selectedMcpServerNames,
    connect,
    disconnect,
    toggle,
    isConnecting,
    isConnected,
    syncWithConfig,
    hydrateFromRuntime
  }
}
