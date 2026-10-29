import { invokeDbMcpServersGet, invokeDbMcpServersSave } from '@renderer/infrastructure/ipc'
import { useAppConfigStore } from '@renderer/infrastructure/config/appConfig'

let pendingSave: Promise<void> = Promise.resolve()

/** Persist only the connection preference, preserving other servers and unsaved edits. */
export const setMcpServerEnabled = (
  name: string,
  enabled: boolean,
  fallback?: LocalMcpServerConfig
): Promise<void> => {
  const operation = pendingSave.then(async (): Promise<void> => {
    const store = useAppConfigStore.getState()
    if (store.savedMcpServerConfig.mcpServers?.[name]?.enabled === enabled
      && store.mcpServerConfig.mcpServers?.[name]?.enabled === enabled) return
    const saved = await invokeDbMcpServersGet()
    const server = saved.mcpServers?.[name] ?? fallback
    if (!server) return
    const next: McpServerConfig = {
      ...saved, mcpServers: { ...saved.mcpServers, [name]: { ...server, enabled } }
    }
    await invokeDbMcpServersSave(next)
    useAppConfigStore.setState(state => ({
      savedMcpServerConfig: next,
      mcpServerConfig: {
        ...state.mcpServerConfig,
        mcpServers: {
          ...state.mcpServerConfig.mcpServers,
          [name]: { ...(state.mcpServerConfig.mcpServers?.[name] ?? server), enabled }
        }
      }
    }))
  })
  pendingSave = operation.catch(() => undefined)
  return operation
}
