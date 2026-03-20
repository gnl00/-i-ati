import { ipcMain } from 'electron'
import DatabaseService from '@main/services/DatabaseService'
import { createLogger } from '@main/services/logging/LogService'
import { DB_MCP_SERVERS_GET, DB_MCP_SERVERS_SAVE } from '@shared/constants'

const logger = createLogger('DatabaseIPC')

export function registerMcpServerHandlers(): void {
  ipcMain.handle(DB_MCP_SERVERS_GET, async () => {
    logger.info('mcp_servers.get')
    return DatabaseService.getMcpServerConfig()
  })

  ipcMain.handle(DB_MCP_SERVERS_SAVE, async (_event, config: McpServerConfig) => {
    logger.info('mcp_servers.save')
    return DatabaseService.saveMcpServerConfig(config)
  })
}
