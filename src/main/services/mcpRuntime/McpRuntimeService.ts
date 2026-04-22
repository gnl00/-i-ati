import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn } from 'child_process'
import { createLogger } from '@main/logging/LogService'

export type McpClientProps = {
  name: string
  type?: string
  url?: string
  command?: string
  args?: string[]
  env?: string[]
}

type McpToolProps = {
  name: string
  description?: string
  inputSchema: any
  source: 'mcp'
  serverName: string
  originalName: string
}

const toMcpTool = (tool: McpToolProps): MCPTool => ({
  type: 'function',
  source: tool.source,
  serverName: tool.serverName,
  originalName: tool.originalName,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as Record<string, unknown>
  }
})

const sanitizeToolNamespacePart = (value: string, fallback: string): string => {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || fallback
}

const toNamespacedToolName = (serverName: string, toolName: string): string => {
  const safeServerName = sanitizeToolNamespacePart(serverName, 'mcp_server')
  const safeToolName = sanitizeToolNamespacePart(toolName, 'tool')
  return `${safeServerName}__${safeToolName}`
}

type McpToolRoute = {
  serverName: string
  originalName: string
  exposedName: string
}

class McpRuntimeRegistry {
  private readonly serverClientMap = new Map<string, Client>()
  private readonly serverToolsMap = new Map<string, McpToolProps[]>()

  addServer(name: string, client: Client, tools: McpToolProps[]): void {
    this.serverClientMap.set(name, client)
    this.serverToolsMap.set(name, tools)
  }

  removeServer(name: string): boolean {
    const client = this.serverClientMap.get(name)
    if (!client) {
      return false
    }
    client.close()
    this.serverClientMap.delete(name)
    this.serverToolsMap.delete(name)
    return true
  }

  removeAllServers(): void {
    this.serverClientMap.forEach(client => client.close())
    this.serverClientMap.clear()
    this.serverToolsMap.clear()
  }

  getAllClients(): [string, Client][] {
    return Array.from(this.serverClientMap.entries())
  }

  getTools(serverName: string): McpToolProps[] | undefined {
    return this.serverToolsMap.get(serverName)
  }

  getTool(toolName: string): McpToolProps | undefined {
    for (const tools of this.serverToolsMap.values()) {
      const match = tools.find(tool => tool.name === toolName)
      if (match) {
        return match
      }
    }
    return undefined
  }

  getClient(serverName: string): Client | undefined {
    return this.serverClientMap.get(serverName)
  }

  getToolRoute(toolName: string): McpToolRoute | undefined {
    const exposedMatch = this.getTool(toolName)
    if (exposedMatch) {
      return {
        serverName: exposedMatch.serverName,
        originalName: exposedMatch.originalName,
        exposedName: exposedMatch.name
      }
    }

    const originalMatches = Array.from(this.serverToolsMap.values())
      .flat()
      .filter(tool => tool.originalName === toolName)

    if (originalMatches.length === 1) {
      const [match] = originalMatches
      return {
        serverName: match.serverName,
        originalName: match.originalName,
        exposedName: match.name
      }
    }

    return undefined
  }

  hasServer(serverName: string): boolean {
    return this.serverClientMap.has(serverName)
  }

  isEmpty(): boolean {
    return this.serverClientMap.size === 0
  }
}

const checkCommandExists = (command: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const process = spawn('which', [command], { stdio: 'ignore' })
    process.on('close', (code) => resolve(code === 0))
    process.on('error', () => resolve(false))
  })
}

class McpRuntimeService {
  private readonly registry = new McpRuntimeRegistry()
  private readonly toolCallCountMap = new Map<string, number>()
  private readonly lastErrorByServer = new Map<string, string>()
  private readonly logger = createLogger('McpRuntimeService')

  async connectServer(props: McpClientProps): Promise<any> {
    this.logger.info('connect.start', {
      serverName: props.name,
      type: props.type,
      url: props.url,
      command: props.command,
      args: props.args
    })

    const client = new Client({
      name: `ati-mcp-client-${props.name}`,
      version: '1.0.0'
    })

    let transport
    if (props.command) {
      try {
        const commandExists = await checkCommandExists(props.command)
        if (!commandExists) {
          throw new Error(`Connect to '${props.name} error. 'Command '${props.command}' not found!`)
        }
        this.logger.debug('connect.create_stdio_transport', { serverName: props.name })
        transport = new StdioClientTransport({
          command: props.command,
          args: props.args
        })
      } catch (error: any) {
        this.logger.error('connect.command_validation_failed', {
          serverName: props.name,
          error: error.message
        })
        return { result: false, msg: error.message }
      }
    } else if (props.url && props.type) {
      if (props.type === 'sse') {
        this.logger.debug('connect.create_sse_transport', { serverName: props.name })
        transport = new SSEClientTransport(new URL(props.url))
      } else if (props.type === 'streamableHttp') {
        this.logger.debug('connect.create_streamable_http_transport', { serverName: props.name })
        transport = new StreamableHTTPClientTransport(new URL(props.url))
      }
    }

    if (!transport) {
      this.logger.warn('connect.transport_missing', { serverName: props.name })
      return { result: false, tools: {}, msg: `Connnected to '${props.name}' Error` }
    }

    try {
      this.logger.info('connect.client_connecting', { serverName: props.name })
      await client.connect(transport)
      const tools = await client.listTools()
      const normalizedTools: McpToolProps[] = tools.tools.map(tool => ({
        ...tool,
        name: toNamespacedToolName(props.name, tool.name),
        source: 'mcp',
        serverName: props.name,
        originalName: tool.name
      }))
      this.registry.addServer(props.name, client, normalizedTools)
      this.lastErrorByServer.delete(props.name)
      this.logger.info('connect.connected', {
        serverName: props.name,
        toolCount: normalizedTools.length
      })
      return {
        result: true,
        tools: normalizedTools.map(toMcpTool),
        msg: `Connected to '${props.name}'`
      }
    } catch (error: any) {
      this.logger.error('connect.failed', {
        serverName: props.name,
        error: error.message
      })
      this.lastErrorByServer.set(props.name, error.message)
      return { result: false, msg: `Failed to connect to '${props.name}': ${error.message}` }
    }
  }

  async callTool(tcId: string, toolName: string, args: { [x: string]: unknown } | undefined): Promise<any[]> {
    const route = this.registry.getToolRoute(toolName)
    this.logger.info('tool_call.start', {
      toolName,
      toolCallId: tcId,
      clientCount: this.registry.getAllClients().length,
      route
    })
    if (this.registry.isEmpty()) {
      return []
    }

    if (!route) {
      this.logger.warn('tool_call.route_missing', {
        toolName,
        toolCallId: tcId
      })
      return []
    }

    const client = this.registry.getClient(route.serverName)
    if (!client) {
      this.logger.warn('tool_call.client_missing', {
        serverName: route.serverName,
        toolName,
        toolCallId: tcId
      })
      return []
    }

    this.logger.info('tool_call.dispatch', {
      serverName: route.serverName,
      toolName: route.exposedName,
      originalToolName: route.originalName,
      toolCallId: tcId,
      args
    })

    let results: any[]
    try {
      const currentCount = this.toolCallCountMap.get(tcId) ?? 0
      if (currentCount >= 3) {
        throw new Error('tool call reached max count=3')
      }
      this.toolCallCountMap.set(tcId, currentCount + 1)
      const result = await client.callTool({ name: route.originalName, arguments: args })
      this.logger.info('tool_call.completed', {
        serverName: route.serverName,
        toolName: route.exposedName,
        originalToolName: route.originalName,
        toolCallId: tcId
      })
      results = [JSON.parse(JSON.stringify(result))]
    } catch (error: any) {
      this.logger.error('tool_call.failed', {
        serverName: route.serverName,
        toolName: route.exposedName,
        originalToolName: route.originalName,
        toolCallId: tcId,
        error: error.message
      })
      results = [{ error: error.message, serverName: route.serverName }]
    }

    this.logger.info('tool_call.end', {
      toolName,
      toolCallId: tcId,
      resultCount: results.length
    })
    return results
  }

  disconnectServer(serverName: string): boolean {
    if (this.registry.isEmpty()) {
      return true
    }
    this.logger.info('disconnect.start', { serverName })
    if (!this.registry.hasServer(serverName)) {
      return true
    }
    const success = this.registry.removeServer(serverName)
    if (success) {
      this.lastErrorByServer.delete(serverName)
      this.logger.info('disconnect.completed', { serverName })
    }
    return success
  }

  disconnectAll(): void {
    if (this.registry.isEmpty()) {
      return
    }
    this.logger.info('disconnect_all.start')
    this.registry.removeAllServers()
    this.lastErrorByServer.clear()
    this.logger.info('disconnect_all.completed')
  }

  getRuntimeSnapshot(): McpRuntimeSnapshot {
    const connectedNames = new Set(this.registry.getAllClients().map(([name]) => name))
    const allNames = new Set<string>([
      ...connectedNames,
      ...this.lastErrorByServer.keys()
    ])

    return {
      servers: Array.from(allNames).map((name) => ({
        name,
        connected: connectedNames.has(name),
        tools: (this.registry.getTools(name) ?? []).map(toMcpTool),
        lastError: this.lastErrorByServer.get(name)
      }))
    }
  }

  getToolSource(toolName: string): 'mcp' | undefined {
    return this.registry.getToolRoute(toolName) ? 'mcp' : undefined
  }
}

export { McpRuntimeService, toNamespacedToolName }
