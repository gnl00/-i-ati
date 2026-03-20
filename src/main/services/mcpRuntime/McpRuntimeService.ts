import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn } from 'child_process'
import { createLogger } from '@main/services/logging/LogService'

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
}

const toMcpTool = (tool: McpToolProps): MCPTool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as Record<string, unknown>
  }
})

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
      this.registry.addServer(props.name, client, tools.tools)
      this.lastErrorByServer.delete(props.name)
      this.logger.info('connect.connected', {
        serverName: props.name,
        toolCount: tools.tools.length
      })
      return {
        result: true,
        tools: tools.tools.map(toMcpTool),
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
    this.logger.info('tool_call.start', {
      toolName,
      toolCallId: tcId,
      clientCount: this.registry.getAllClients().length
    })
    if (this.registry.isEmpty()) {
      return []
    }

    const promises = this.registry.getAllClients().map(async ([serverName, client]) => {
      const tools = this.registry.getTools(serverName)
      if (!tools || tools.every(tool => tool.name !== toolName)) {
        this.logger.debug('tool_call.tool_not_found_on_server', {
          serverName,
          toolName,
          toolCallId: tcId
        })
        return null
      }

      this.logger.info('tool_call.dispatch', {
        serverName,
        toolName,
        toolCallId: tcId,
        args
      })
      try {
        const currentCount = this.toolCallCountMap.get(tcId) ?? 0
        if (currentCount >= 3) {
          throw new Error('tool call reached max count=3')
        }
        this.toolCallCountMap.set(tcId, currentCount + 1)
        const result = await client.callTool({ name: toolName, arguments: args })
        this.logger.info('tool_call.completed', {
          serverName,
          toolName,
          toolCallId: tcId
        })
        return JSON.parse(JSON.stringify(result))
      } catch (error: any) {
        this.logger.error('tool_call.failed', {
          serverName,
          toolName,
          toolCallId: tcId,
          error: error.message
        })
        return { error: error.message, serverName }
      }
    })

    const results = await Promise.all(promises)
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
}

export { McpRuntimeService }
