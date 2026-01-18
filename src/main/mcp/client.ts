import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from 'child_process';

export type ClientProps = {
  name: string
  type?: string
  url?: string
  command?: string
  args?: string[]
  env?: string[]
}

type ToolProps = {
  name: string
  description?: string
  inputSchema: any
}

class McpClient {
  private serverClientMap = new Map<string, Client>()
  private serverToolsMap = new Map<string, ToolProps[]>()

  addServer(name: string, client: Client, tools: ToolProps[]) {
    this.serverClientMap.set(name, client)
    this.serverToolsMap.set(name, tools)
  }

  removeServer(name: string): boolean {
    const client = this.serverClientMap.get(name)
    if (client) {
      client.close()
      this.serverClientMap.delete(name)
      this.serverToolsMap.delete(name)
      return true
    }
    return false
  }

  removeAllServers() {
    this.serverClientMap.forEach((client) => {
      client.close()
    })
    this.serverClientMap.clear()
    this.serverToolsMap.clear()
  }

  hasTool(toolName: string): boolean {
    for (const tools of this.serverToolsMap.values()) {
      if (tools.some(tool => tool.name === toolName)) {
        return true
      }
    }
    return false
  }

  getClient(serverName: string): Client | undefined {
    return this.serverClientMap.get(serverName)
  }

  getAllClients(): [string, Client][] {
    return Array.from(this.serverClientMap.entries())
  }

  getTools(serverName: string): ToolProps[] | undefined {
    return this.serverToolsMap.get(serverName)
  }

  hasServer(serverName: string): boolean {
    return this.serverClientMap.has(serverName)
  }

  getServerCount(): number {
    return this.serverClientMap.size
  }

  getServerNames(): string[] {
    return Array.from(this.serverClientMap.keys())
  }

  isEmpty(): boolean {
    return this.serverClientMap.size === 0
  }
}


const mcpClient = new McpClient()

const checkCommandExists = (command: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const process = spawn('which', [command], { stdio: 'ignore' });
    process.on('close', (code) => {
      resolve(code === 0);
    });
    process.on('error', () => {
      resolve(false);
    });
  });
}

const connect = async (props: ClientProps) => {
  console.log('[@i] mcp-client connect to server:', props.name, JSON.stringify(props));

  const client = new Client({
    name: "ati-mcp-client-" + props.name,
    version: "1.0.0"
  })

  let transport
  if (props.command) {
    try {
      // Check if command exists locally
      const commandExists = await checkCommandExists(props.command);
      if (!commandExists) {
        throw new Error(`Connect to '${props.name} error. 'Command '${props.command}' not found!`)
      }
      console.log('[@i] creating StdioClientTransport');
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
      console.log('[@i] creating SSEClientTransport');
      transport = new SSEClientTransport(new URL(props.url))
    } else if (props.type === 'streamableHttp') {
      console.log('[@i] creating StreamableHTTPClientTransport');
      transport = new StreamableHTTPClientTransport(new URL(props.url))
    }
  }

  console.log('[@i] mcp transport protocol', JSON.stringify(transport));

  if (transport) {
    try {
      console.log('[@i] mcp-client connecting')
      await client.connect(transport)
      // List tools
      const tools = await client.listTools()
      mcpClient.addServer(props.name, client, tools.tools)
      console.log('[@i] mcp-tools\n', JSON.stringify(tools))
      return { result: true, tools: tools.tools, msg: `Connected to '${props.name}'` }
    } catch (error: any) {
      console.error(`[@i] mcp-server '${props.name}' connection error:`, error)
      return { result: false, msg: `Failed to connect to '${props.name}': ${error.message}` }
    }
  }

  // // List resources
  // if (client.listResources) {
  //   const resources = await client.listResources();
  //   console.log('[@i] mcp-resources', resources);
  // }

  // // List prompts
  // if (client.listPrompts) {
  //   const prompts = await client.listPrompts();
  //   console.log('[@i] mcp-prompts', prompts);
  // }
  return { result: false, tools: {}, msg: `Connnected to '${props.name}' Error` }
}

let toolCallCountMap: Map<string, number> = new Map()
const toolCall = async (tcId: string, toolName: string, args: { [x: string]: unknown } | undefined) => {
  console.log(`[@i] toolCall ${toolName} start, getAllClients.length=${mcpClient.getAllClients().length}`);
  if (!mcpClient.isEmpty()) {
    console.log(`[@i] toolCall ${toolName} ID ${tcId} processing`);
    const promises = mcpClient.getAllClients().map(async ([serverName, c]) => {
      const tools = mcpClient.getTools(serverName)
      if (!tools || tools.filter(item => item.name === toolName).length === 0) {
        console.log(`[@i] mcp-server: ${serverName} does not have tool: ${toolName}`);
        return null
      }
      console.log(`[@i] Call mcp-server: ${serverName}, tool: ${toolName}, args: ${JSON.stringify(args)}`);
      try {
        const currentCount = toolCallCountMap.get(tcId) ?? 0
        if (currentCount >= 3) {
          throw new Error('tool call reached max count=3')
        }
        toolCallCountMap.set(tcId, currentCount + 1)
        const result = await c.callTool({ name: toolName, arguments: args })
        console.log(`[@i] Call mcp-server: ${serverName}, tool: ${toolName}, result: ${JSON.stringify(result)}`);
        // Serialize the result to ensure it can be cloned across processes
        return JSON.parse(JSON.stringify(result))
      } catch (error: any) {
        console.error(`[@i] Error calling tool on ${serverName}:`, error);
        return { error: error.message, serverName: serverName }
      }
    })
    const results = await Promise.all(promises)
    console.log(`[@i] toolCall ${toolName} end`);
    return results
  }
  return []
}

const close = (mcpServerName: string) => {
  if (!mcpClient.isEmpty()) {
    console.log('[@i] mcp-client closing')
    if (!mcpClient.hasServer(mcpServerName)) {
      return true
    }
    const success = mcpClient.removeServer(mcpServerName)
    if (success) {
      console.log('[@i] mcp-client closed')
      return true
    }
    return false
  }
  return true
}

const closeAll = () => {
  if (!mcpClient.isEmpty()) {
    console.log('[@i] mcp-client closing')
    mcpClient.removeAllServers()
    console.log('[@i] mcp-client closed')
  }
}

// const transport = new StdioClientTransport({
//   command: "node",
//   args: ["server.js"]
// });

export { McpClient, close, closeAll, connect, mcpClient, toolCall };

