import type { ConfigRepository } from '@main/db/repositories/ConfigRepository'
import type { McpServerRepository } from '@main/db/repositories/McpServerRepository'

type McpServerDataServiceDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/Database').AppDatabase['getDb']> | null
  getMcpServerRepo: () => McpServerRepository | undefined
  getConfigRepo: () => ConfigRepository | undefined
}

export class McpServerDataService {
  constructor(private readonly deps: McpServerDataServiceDeps) {}

  getMcpServerConfig(): McpServerConfig {
    this.assertDbReady()
    this.migrateLegacyConfigIfNeeded()

    const rows = this.requireMcpServerRepo().getAll()
    const mcpServers = rows.reduce<Record<string, LocalMcpServerConfig>>((acc, row) => {
      try {
        acc[row.name] = JSON.parse(row.config_json) as LocalMcpServerConfig
      } catch {
        acc[row.name] = {}
      }
      return acc
    }, {})

    return { mcpServers }
  }

  saveMcpServerConfig(config: McpServerConfig): void {
    this.assertDbReady()

    const db = this.requireDb()
    const repo = this.requireMcpServerRepo()
    const mcpServers = config?.mcpServers && typeof config.mcpServers === 'object'
      ? config.mcpServers
      : {}
    const incomingNames = new Set(Object.keys(mcpServers))
    const existingRows = repo.getAll()
    const now = Date.now()

    const tx = db.transaction(() => {
      Object.entries(mcpServers).forEach(([name, serverConfig]) => {
        if (!name) return
        const existing = existingRows.find(row => row.name === name)
        repo.upsert({
          name,
          config_json: JSON.stringify(serverConfig ?? {}),
          created_at: existing?.created_at ?? now,
          updated_at: now
        })
      })

      existingRows.forEach(row => {
        if (incomingNames.has(row.name)) return
        repo.deleteByName(row.name)
      })
    })

    tx()
  }

  private migrateLegacyConfigIfNeeded(): void {
    const repo = this.requireMcpServerRepo()
    if (repo.countAll() > 0) return

    const configRepo = this.deps.getConfigRepo()
    const configRow = configRepo?.getConfig()
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

    this.saveMcpServerConfig(legacyMcp)

    const { mcp: _legacy, ...nextConfig } = config
    configRepo?.saveConfig(JSON.stringify(nextConfig), nextConfig.version ?? null)
  }

  private assertDbReady(): void {
    if (!this.deps.hasDb()) {
      throw new Error('Database not initialized')
    }
  }

  private requireDb(): ReturnType<import('@main/db/Database').AppDatabase['getDb']> {
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requireMcpServerRepo(): McpServerRepository {
    const repo = this.deps.getMcpServerRepo()
    if (!repo) throw new Error('MCP server repository not initialized')
    return repo
  }
}
