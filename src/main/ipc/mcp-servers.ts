import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { DB_MCP_SERVERS_GET, DB_MCP_SERVERS_SAVE } from '@shared/constants'

export function registerMcpServerHandlers(): void {
  ipcMain.handle(DB_MCP_SERVERS_GET, async () => {
    console.log('[Database IPC] Get MCP servers')
    return DatabaseService.getMcpServerConfig()
  })

  ipcMain.handle(DB_MCP_SERVERS_SAVE, async (_event, config: McpServerConfig) => {
    console.log('[Database IPC] Save MCP servers')
    return DatabaseService.saveMcpServerConfig(config)
  })
}
