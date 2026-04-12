import { describe, expect, it } from 'vitest'
import { McpServerRepository } from '../../repositories/McpServerRepository'
import { McpServerMigrationService } from '../McpServerMigrationService'

const createTransactionDb = () => ({
  transaction<T extends (...args: any[]) => any>(fn: T) {
    return (...args: Parameters<T>) => fn(...args)
  }
})

const createInMemoryRepo = (initialRows: Array<{
  name: string
  config_json: string
  created_at: number
  updated_at: number
}> = []) => {
  const rows = [...initialRows]
  return {
    rows,
    getAll() {
      return [...rows].sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name))
    },
    countAll() {
      return rows.length
    },
    upsert(row: {
      name: string
      config_json: string
      created_at: number
      updated_at: number
    }) {
      const index = rows.findIndex(item => item.name === row.name)
      if (index >= 0) {
        rows[index] = { ...rows[index], config_json: row.config_json, updated_at: row.updated_at }
        return
      }
      rows.push(row)
    },
    deleteByName(name: string) {
      const index = rows.findIndex(item => item.name === name)
      if (index >= 0) {
        rows.splice(index, 1)
      }
    }
  }
}

describe('McpServerMigrationService', () => {
  it('migrates legacy config.mcp into the dedicated MCP table', () => {
    const repo = createInMemoryRepo()
    let savedConfigValue = JSON.stringify({
      version: 2,
      tools: { maxWebSearchItems: 3 },
      mcp: {
        mcpServers: {
          exa: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-exa']
          }
        }
      }
    })

    const repository = new McpServerRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getMcpServerRepo: () => repo as any
    })

    const service = new McpServerMigrationService({
      configDao: () =>
        ({
          getConfig: () => ({
            key: 'appConfig',
            value: savedConfigValue,
            version: 2,
            updated_at: 1
          }),
          saveConfig: (value: string) => {
            savedConfigValue = value
          }
        }) as any,
      mcpServerDao: () => repo as any,
      mcpServerRepository: () => repository
    })

    service.migrateLegacyConfigIfNeeded()

    expect(repository.getMcpServerConfig()).toEqual({
      mcpServers: {
        exa: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-exa']
        }
      }
    })

    expect(JSON.parse(savedConfigValue)).toEqual({
      version: 2,
      tools: { maxWebSearchItems: 3 }
    })
  })
})
