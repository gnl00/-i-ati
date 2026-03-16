import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { spawn } from 'child_process'

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

  async connectServer(props: McpClientProps): Promise<any> {
    console.log('[@i] mcp-client connect to server:', props.name, JSON.stringify(props))

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
        console.log('[@i] creating StdioClientTransport')
        transport = new StdioClientTransport({
          command: props.command,
          args: props.args
        })
      } catch (error: any) {
        console.error(`[@i] mcp-server '${props.name}' connect error: ${error.message}`)
        return { result: false, msg: error.message }
      }
    } else if (props.url && props.type) {
      if (props.type === 'sse') {
        console.log('[@i] creating SSEClientTransport')
        transport = new SSEClientTransport(new URL(props.url))
      } else if (props.type === 'streamableHttp') {
        console.log('[@i] creating StreamableHTTPClientTransport')
        transport = new StreamableHTTPClientTransport(new URL(props.url))
      }
    }

    console.log('[@i] mcp transport protocol', JSON.stringify(transport))

    if (!transport) {
      return { result: false, tools: {}, msg: `Connnected to '${props.name}' Error` }
    }

    try {
      console.log('[@i] mcp-client connecting')
      await client.connect(transport)
      const tools = await client.listTools()
      this.registry.addServer(props.name, client, tools.tools)
      this.lastErrorByServer.delete(props.name)
      console.log('[@i] mcp-tools\n', JSON.stringify(tools))
      return {
        result: true,
        tools: tools.tools.map(toMcpTool),
        msg: `Connected to '${props.name}'`
      }
    } catch (error: any) {
      console.error(`[@i] mcp-server '${props.name}' connection error:`, error)
      this.lastErrorByServer.set(props.name, error.message)
      return { result: false, msg: `Failed to connect to '${props.name}': ${error.message}` }
    }
  }

  async callTool(tcId: string, toolName: string, args: { [x: string]: unknown } | undefined): Promise<any[]> {
    console.log(`[@i] toolCall ${toolName} start, getAllClients.length=${this.registry.getAllClients().length}`)
    if (this.registry.isEmpty()) {
      return []
    }

    console.log(`[@i] toolCall ${toolName} ID ${tcId} processing`)
    const promises = this.registry.getAllClients().map(async ([serverName, client]) => {
      const tools = this.registry.getTools(serverName)
      if (!tools || tools.every(tool => tool.name !== toolName)) {
        console.log(`[@i] mcp-server: ${serverName} does not have tool: ${toolName}`)
        return null
      }

      console.log(`[@i] Call mcp-server: ${serverName}, tool: ${toolName}, args: ${JSON.stringify(args)}`)
      try {
        const currentCount = this.toolCallCountMap.get(tcId) ?? 0
        if (currentCount >= 3) {
          throw new Error('tool call reached max count=3')
        }
        this.toolCallCountMap.set(tcId, currentCount + 1)
        const result = await client.callTool({ name: toolName, arguments: args })
        console.log(`[@i] Call mcp-server: ${serverName}, tool: ${toolName}, result: ${JSON.stringify(result)}`)
        return JSON.parse(JSON.stringify(result))
      } catch (error: any) {
        console.error(`[@i] Error calling tool on ${serverName}:`, error)
        return { error: error.message, serverName }
      }
    })

    const results = await Promise.all(promises)
    console.log(`[@i] toolCall ${toolName} end`)
    return results
  }

  disconnectServer(serverName: string): boolean {
    if (this.registry.isEmpty()) {
      return true
    }
    console.log('[@i] mcp-client closing')
    if (!this.registry.hasServer(serverName)) {
      return true
    }
    const success = this.registry.removeServer(serverName)
    if (success) {
      this.lastErrorByServer.delete(serverName)
      console.log('[@i] mcp-client closed')
    }
    return success
  }

  disconnectAll(): void {
    if (this.registry.isEmpty()) {
      return
    }
    console.log('[@i] mcp-client closing')
    this.registry.removeAllServers()
    this.lastErrorByServer.clear()
    console.log('[@i] mcp-client closed')
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
