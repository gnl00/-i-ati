import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpRuntimeService, toNamespacedToolName } from '../McpRuntimeService'

vi.mock('@main/logging/LogService', (): object => ({
  createLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  })
}))

const createClient = (): { callTool: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } => ({
  callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
  close: vi.fn()
})

const addServer = (
  service: McpRuntimeService,
  serverName: string,
  client: ReturnType<typeof createClient>,
  originalToolName: string
) : void => {
  const registry = (service as unknown as { registry: { addServer(name: string, client: unknown, tools: unknown[]): void } }).registry
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


describe('McpRuntimeService modern protocol', () => {
  afterEach(() => vi.unstubAllGlobals())

  const serve = (versions = ['2026-07-28'], capabilities: Record<string, unknown> = { tools: {} }, paginate = false): { method: string; params: { _meta: Record<string, unknown> } }[] => {
    const requests: { method: string; params: { _meta: Record<string, unknown> } }[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body)
      requests.push(request)
      let result: Record<string, unknown>
      if (request.method === 'server/discover') {
        result = { supportedVersions: versions, capabilities }
      } else if (request.method === 'tools/list') {
        result = {
          tools: [{ name: request.params?.cursor ? 'second' : 'search', inputSchema: { type: 'object' } }],
          ...(paginate && !request.params?.cursor ? { nextCursor: 'page-2' } : {}),
          ttlMs: 0, cacheScope: 'private'
        }
      } else {
        result = { content: [{ type: 'text', text: 'ok' }], structuredContent: [1, 2] }
      }
      return Response.json({ jsonrpc: '2.0', id: request.id, result: { resultType: 'complete', ...result } })
    }))
    return requests
  }

  it('discovers and calls a modern HTTP server with per-request version metadata', async () => {
    const requests = serve()
    const service = new McpRuntimeService()
    try {
      const connected = await service.connectServer({ name: 'modern', type: 'streamableHttp', url: 'https://mcp.test/mcp' })
      expect(connected.result).toBe(true)
      expect(connected.tools?.[0].function.name).toBe('modern__search')
      expect(await service.callTool('modern-call', 'modern__search', {})).toEqual([
        expect.objectContaining({ content: [{ type: 'text', text: 'ok' }], structuredContent: [1, 2] })
      ])
      expect(requests.map(request => request.method)).toEqual(['server/discover', 'tools/list', 'tools/call'])
      for (const request of requests) {
        expect(request.params._meta['io.modelcontextprotocol/protocolVersion']).toBe('2026-07-28')
      }
    } finally {
      service.disconnectAll()
    }
  })

  it('collects every tools/list page through the SDK', async () => {
    const requests = serve(['2026-07-28'], { tools: {} }, true)
    const service = new McpRuntimeService()
    try {
      const connected = await service.connectServer({ name: 'pages', type: 'streamableHttp', url: 'https://mcp.test/mcp' })
      expect(connected.result).toBe(true)
      expect(connected.tools?.map(tool => tool.function.name)).toEqual(['pages__search', 'pages__second'])
      expect(requests.filter(request => request.method === 'tools/list')).toHaveLength(2)
    } finally {
      service.disconnectAll()
    }
  })

  it('rejects old protocol servers without sending initialize', async () => {
    const requests = serve(['2025-11-25'])
    const service = new McpRuntimeService()
    const connected = await service.connectServer({ name: 'old', type: 'streamableHttp', url: 'https://mcp.test/mcp' })
    expect(connected.result).toBe(false)
    expect(requests.map(request => request.method)).toEqual(['server/discover'])
    expect(service.getRuntimeSnapshot().servers[0].connected).toBe(false)
  })

  it('rejects servers without tool capability', async () => {
    const requests = serve(['2026-07-28'], {})
    const service = new McpRuntimeService()
    expect((await service.connectServer({ name: 'empty', type: 'streamableHttp', url: 'https://mcp.test/mcp' })).result).toBe(false)
    expect(requests.map(request => request.method)).toEqual(['server/discover'])
  })

  it('connects and calls a modern stdio child process', async () => {
    const service = new McpRuntimeService()
    try {
      const connected = await service.connectServer({
        name: 'stdio', command: process.execPath,
        args: [fileURLToPath(new URL('./fixtures/modern-server.mjs', import.meta.url))]
      })
      expect(connected.result).toBe(true)
      expect(await service.callTool('stdio-call', 'stdio__echo', { message: 'hello' })).toEqual([
        expect.objectContaining({ content: [{ type: 'text', text: '{"message":"hello"}' }] })
      ])
    } finally {
      service.disconnectAll()
    }
  })

  it('rejects removed SSE configurations', async () => {
    const service = new McpRuntimeService()
    const connected = await service.connectServer({ name: 'sse', type: 'sse' as 'streamableHttp', url: 'https://mcp.test/sse' })
    expect(connected.result).toBe(false)
    expect(connected.msg).toContain('Unsupported MCP transport')
  })
})
