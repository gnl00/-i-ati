import type { ConfigDao } from '@main/db/dao/ConfigDao'
import type { McpServerDao } from '@main/db/dao/McpServerDao'
import type { McpServerRepository } from '@main/db/repositories/McpServerRepository'

type McpServerMigrationServiceDeps = {
  configDao: () => ConfigDao | undefined
  mcpServerDao: () => McpServerDao | undefined
  mcpServerRepository: () => McpServerRepository | undefined
}

export class McpServerMigrationService {
  constructor(private readonly deps: McpServerMigrationServiceDeps) {}

  migrateLegacyConfigIfNeeded(): void {
    const mcpServerDao = this.requireMcpServerDao()
    if (mcpServerDao.countAll() > 0) return

    const configDao = this.deps.configDao()
    const configRow = configDao?.getConfig()
    if (!configRow?.value) return

    let config: IAppConfig
    try {
      config = JSON.parse(configRow.value) as IAppConfig
    } catch {
      return
    }

    const legacyMcp = config.mcp
    const hasLegacyServers = legacyMcp?.mcpServers
      && typeof legacyMcp.mcpServers === 'object'
      && Object.keys(legacyMcp.mcpServers).length > 0

    if (!hasLegacyServers) return

    this.requireMcpServerRepository().saveMcpServerConfig(legacyMcp)

    const { mcp: _legacyMcp, ...nextConfig } = config
    configDao?.saveConfig(JSON.stringify(nextConfig), nextConfig.version ?? null)
  }

  private requireMcpServerDao(): McpServerDao {
    const dao = this.deps.mcpServerDao()
    if (!dao) throw new Error('MCP server DAO not initialized')
    return dao
  }

  private requireMcpServerRepository(): McpServerRepository {
    const repository = this.deps.mcpServerRepository()
    if (!repository) throw new Error('MCP server repository not initialized')
    return repository
  }
}
