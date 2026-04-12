import type { McpServerDao } from '@main/db/dao/McpServerDao'

type McpServerRepositoryDeps = {
  hasDb: () => boolean
  getDb: () => ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> | null
  getMcpServerRepo: () => McpServerDao | undefined
}

export class McpServerRepository {
  constructor(private readonly deps: McpServerRepositoryDeps) {}

  getMcpServerConfig(): McpServerConfig {
    this.assertDbReady()

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

  private assertDbReady(): void {
    if (!this.deps.hasDb()) {
      throw new Error('Database not initialized')
    }
  }

  private requireDb(): ReturnType<import('@main/db/core/Database').AppDatabase['getDb']> {
    const db = this.deps.getDb()
    if (!db) throw new Error('Database not initialized')
    return db
  }

  private requireMcpServerRepo(): McpServerDao {
    const repo = this.deps.getMcpServerRepo()
    if (!repo) throw new Error('MCP server repository not initialized')
    return repo
  }
}
