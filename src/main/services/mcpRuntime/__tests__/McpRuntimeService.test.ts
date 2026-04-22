import { describe, expect, it, vi } from 'vitest'
import { McpRuntimeService, toNamespacedToolName } from '../McpRuntimeService'

vi.mock('@main/logging/LogService', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

const createClient = () => ({
  callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  close: vi.fn()
})

const addServer = (
  service: McpRuntimeService,
  serverName: string,
  client: ReturnType<typeof createClient>,
  originalToolName: string
) => {
  const registry = (service as any).registry
  registry.addServer(serverName, client, [
    {
      name: toNamespacedToolName(serverName, originalToolName),
      description: `${serverName} ${originalToolName}`,
      inputSchema: {
        type: 'object',
        properties: {}
      },
      source: 'mcp',
      serverName,
      originalName: originalToolName
    }
  ])
}

describe('McpRuntimeService tool namespace routing', () => {
  it('creates provider-compatible namespaced tool names', () => {
    expect(toNamespacedToolName('github enterprise', 'search/repositories')).toBe(
      'github_enterprise__search_repositories'
    )
    expect(toNamespacedToolName('server__name', 'tool__name')).toBe('server_name__tool_name')
  })

  it('routes a namespaced mcp tool call to one server with the original tool name', async () => {
    const service = new McpRuntimeService()
    const alphaClient = createClient()
    const betaClient = createClient()

    addServer(service, 'alpha', alphaClient, 'search')
    addServer(service, 'beta', betaClient, 'search')

    const result = await service.callTool('call-1', 'alpha__search', { query: 'hello' })

    expect(result).toEqual([{ content: [{ type: 'text', text: 'ok' }] }])
    expect(alphaClient.callTool).toHaveBeenCalledWith({
      name: 'search',
      arguments: { query: 'hello' }
    })
    expect(betaClient.callTool).not.toHaveBeenCalled()
  })

  it('reports mcp source for namespaced tool names', () => {
    const service = new McpRuntimeService()
    const alphaClient = createClient()

    addServer(service, 'alpha', alphaClient, 'search')

    expect(service.getToolSource('alpha__search')).toBe('mcp')
  })

  it('returns namespaced tool names in runtime snapshots', () => {
    const service = new McpRuntimeService()
    const alphaClient = createClient()

    addServer(service, 'alpha', alphaClient, 'search')

    expect(service.getRuntimeSnapshot().servers).toEqual([
      {
        name: 'alpha',
        connected: true,
        tools: [
          {
            type: 'function',
            source: 'mcp',
            serverName: 'alpha',
            originalName: 'search',
            function: {
              name: 'alpha__search',
              description: 'alpha search',
              parameters: {
                type: 'object',
                properties: {}
              }
            }
          }
        ],
        lastError: undefined
      }
    ])
  })
})
