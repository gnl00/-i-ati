import { describe, expect, it } from 'vitest'
import { McpServerRepository } from '../McpServerRepository'

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

describe('McpServerRepository', () => {
  it('loads persisted MCP servers as config object', () => {
    const repo = createInMemoryRepo([
      {
        name: 'exa',
        config_json: JSON.stringify({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-exa'] }),
        created_at: 1,
        updated_at: 1
      }
    ])

    const service = new McpServerRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getMcpServerRepo: () => repo as any
    })

    expect(service.getMcpServerConfig()).toEqual({
      mcpServers: {
        exa: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-exa']
        }
      }
    })
  })

  it('replaces persisted MCP servers on save', () => {
    const repo = createInMemoryRepo([
      {
        name: 'old-server',
        config_json: JSON.stringify({ type: 'sse', url: 'https://old.example.com/sse' }),
        created_at: 1,
        updated_at: 1
      }
    ])

    const service = new McpServerRepository({
      hasDb: () => true,
      getDb: () => createTransactionDb() as any,
      getMcpServerRepo: () => repo as any
    })

    service.saveMcpServerConfig({
      mcpServers: {
        exa: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-exa']
        }
      }
    })

    expect(service.getMcpServerConfig()).toEqual({
      mcpServers: {
        exa: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-exa']
        }
      }
    })
  })
})
