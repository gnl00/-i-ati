import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from 'child_process';

export type ClientProps = {
  name: string
  command: string
  args?: string[]
  env?: string[]
}

const mcpMap = new Map<string, Client>()

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
  console.log('[@i] mcp-client connect to server:', props.name);
  
  try {
    // Check if command exists locally
    const commandExists = await checkCommandExists(props.command);
    if (!commandExists) {
      throw new Error(`Connect to '${props.name} error. 'Command '${props.command}' not found!`)
    }
    
    const client = new Client({
      name: "mcp-client-" + props.name,
      version: "1.0.0"
    })
    
    const transport = new StdioClientTransport({
      command: props.command,
      args: props.args
    })

    console.log('[@i] mcp-client connecting')
    await client.connect(transport)
    mcpMap.set(props.name, client)
    // List tools
    const tools = await client.listTools()
    console.log('[@i] mcp-tools', JSON.stringify(tools))
    return {result: true, tools: tools.tools, msg: `Connnected to '${props.name}'`}
  } catch (error: any) {
    console.error(`[@i] mcp-server '${props.name}' connect error: ${error.message}`)
    return {result: false, msg: error.message}
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
}

const toolCall = async (mcpServer: string, toolName: string, args: { [x: string]: unknown } | undefined) => {
  if (mcpMap && mcpMap.has(mcpServer)) {
    const c = mcpMap.get(mcpServer)
    if (c) {
      const result = await c.callTool({name: toolName, arguments: args})
      return result // TODO push to message
    }
  }
}

const close = (mcpServerName) => {
  if (mcpMap.size > 0) {
    console.log('[@i] mcp-client closing')
    const c = mcpMap.get(mcpServerName)
    if (c) {
      c.close()
      console.log('[@i] mcp-client closed')
    }
  }
}

const closeAll = () => {
  if (mcpMap.size > 0) {
    console.log('[@i] mcp-client closing')
    mcpMap.forEach((mClient, _) => {
      mClient && mClient.close()
    })
    console.log('[@i] mcp-client closed')
  }
}

// const transport = new StdioClientTransport({
//   command: "node",
//   args: ["server.js"]
// });

export {
  connect, close, closeAll,
  toolCall
}

